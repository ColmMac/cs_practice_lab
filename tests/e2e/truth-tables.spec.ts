import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const rowsOf = (page: import('@playwright/test').Page) =>
  page.getByRole('table', { name: 'Truth table' }).locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('th, td')).map((td) => td.textContent)),
  )

test('a preset shows its table, with the input and output groups', async ({ page }) => {
  await page.goto('/truth-tables')
  await expect(page.getByRole('heading', { level: 1, name: 'Truth tables' })).toBeVisible()
  await page.getByLabel('Example').selectOption({ label: 'Half adder' })
  await expect(page).toHaveURL(/\?preset=half-adder/)
  // A, B, S (= A XOR B), C (= A AND B)
  await expect.poll(() => rowsOf(page)).toEqual([
    ['0', '0', '0', '0'],
    ['0', '1', '1', '0'],
    ['1', '0', '1', '0'],
    ['1', '1', '0', '1'],
  ])
  await expect(page.getByRole('columnheader', { name: 'Inputs' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Outputs' })).toBeVisible()
})

test('the ?expr= deep link renders, and the notation and intermediate toggles apply', async ({ page }) => {
  await page.goto('/truth-tables?expr=' + encodeURIComponent('Q = A AND (B OR C)'))
  await expect(page.locator('#truth-expr')).toHaveValue('Q = A AND (B OR C)')
  await expect(page.getByRole('table', { name: 'Truth table' }).locator('tbody tr')).toHaveCount(8)
  await expect(page.getByLabel('Fully bracketed reading')).toHaveText('Q = (A AND (B OR C))')

  await page.getByRole('radio', { name: 'T / F' }).click()
  await expect(page.getByRole('cell', { name: 'T' }).first()).toBeVisible()
  await page.getByRole('radio', { name: '0 / 1' }).click()

  await page.getByRole('radiogroup', { name: 'Intermediate columns' }).getByRole('radio', { name: 'On' }).click()
  await expect(page.getByRole('columnheader', { name: 'Intermediate' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'B OR C' })).toBeVisible()
})

test('an invalid expression announces the error, underlines it and shows no table', async ({ page }) => {
  await page.goto('/truth-tables')
  await page.locator('#truth-expr').fill('A AND')
  await expect(page.locator('#truth-expr-status')).toContainText('Error:')
  await expect(page.getByTestId('live-region')).toContainText('Error:')
  await expect(page.getByTestId('error-underline')).toBeVisible()
  await expect(page.getByRole('table', { name: 'Truth table' })).toHaveCount(0)
})

test('operator buttons insert at the cursor and the last expression is remembered', async ({ page }) => {
  await page.goto('/truth-tables')
  const box = page.locator('#truth-expr')
  await box.fill('')
  await page.getByRole('button', { name: 'Insert A', exact: true }).click()
  await page.getByRole('button', { name: 'Insert XOR' }).click()
  await page.getByRole('button', { name: 'Insert B', exact: true }).click()
  await expect(box).toHaveValue('A XOR B')
  await expect(page).toHaveURL(/\?expr=/)

  await page.goto('/truth-tables')
  await expect(box).toHaveValue('A XOR B')
})

test('study mode: a right and a wrong answer are graded, then Exit restores the table', async ({ page }) => {
  await page.goto('/truth-tables?preset=half-adder')
  await page.getByRole('button', { name: /study mode/i }).click()
  const boxes = page.getByRole('textbox', { name: /^Row \d+, / })
  await expect(boxes).toHaveCount(8) // 4 rows × (S, C)
  await expect(boxes.first()).toBeFocused()

  await boxes.nth(0).fill('0') // row 1, S = 0 XOR 0 = 0: right
  await boxes.nth(2).fill('0') // row 2, S = 0 XOR 1 = 1: wrong
  await page.getByRole('button', { name: 'Check answers' }).click()
  await expect(page.getByRole('region', { name: 'Score', exact: true })).toContainText(/Score: 1 \/ 8/)
  await expect(boxes.nth(0)).toHaveAccessibleDescription(/Correct/)
  await expect(boxes.nth(2)).toHaveAccessibleDescription(/Not correct/)

  await page.getByRole('button', { name: 'Exit study mode' }).click()
  await expect(boxes).toHaveCount(0)
  await expect.poll(() => rowsOf(page)).toHaveLength(4)
})

test('export: downloads the key and the worksheet as Markdown, and is disabled for an invalid expression', async ({ page }) => {
  await page.goto('/truth-tables?preset=half-adder')
  await expect(page.getByRole('table', { name: 'Truth table' }).locator('tbody tr')).toHaveCount(4)

  await page.getByRole('button', { name: /export/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Export' })
  const [key] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download .md' }).click()])
  expect(key.suggestedFilename()).toBe('truth-table.md')
  const { readFile } = await import('node:fs/promises')
  const keyText = await readFile((await key.path())!, 'utf8')
  expect(keyText).toContain('| `A` | `B` | `S` | `C` |')
  expect(keyText).toContain('| `1` | `1` | `0` | `1` |')

  await dialog.getByRole('radio', { name: 'Worksheet' }).click()
  await expect(dialog.getByText('Blanks 8 cells')).toBeVisible()
  const [sheet] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Download .md' }).click()])
  expect(sheet.suggestedFilename()).toBe('truth-table-worksheet.md')
  const sheetText = await readFile((await sheet.path())!, 'utf8')
  expect(sheetText).toContain('| `1` | `1` |  |  |')

  await page.keyboard.press('Escape')
  await page.locator('#truth-expr').fill('A AND')
  await expect(page.getByRole('button', { name: /export/i })).toBeDisabled()
})

test.describe('axe audit on the real page', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  for (const theme of ['light', 'dark'] as const) {
    test(`no axe violations in ${theme} mode (table, error and study states)`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
      await page.goto('/truth-tables?preset=full-adder')
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
      await expect(page.getByRole('table', { name: 'Truth table' }).locator('tbody tr')).toHaveCount(8)
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })

      const audit = async (label: string) => {
        const results = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
          const r = await axe.run()
          return r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
        })
        expect(results, `${label} (${theme})`).toEqual([])
      }

      await audit('table')
      await page.getByRole('radiogroup', { name: 'Intermediate columns' }).getByRole('radio', { name: 'On' }).click()
      await audit('intermediates on')
      await page.locator('#truth-expr').fill('A AND')
      await expect(page.getByTestId('error-underline')).toBeVisible()
      await audit('error')
      await page.locator('#truth-expr').fill('A XOR B')
      await page.getByRole('button', { name: /study mode/i }).click()
      await expect(page.getByRole('textbox', { name: /^Row \d+, / }).first()).toBeVisible()
      await audit('study mode')
    })
  }
})
