import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const rowsOf = (page: import('@playwright/test').Page) =>
  page.getByRole('table', { name: 'Truth table' }).locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent)),
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
  await expect(page.locator('#truth-expr-status')).toHaveAttribute('aria-live', 'polite')
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
  await expect(page.getByText(/Score: 1 \/ 8/)).toBeVisible()
  await expect(boxes.nth(0)).toHaveAccessibleDescription(/Correct/)
  await expect(boxes.nth(2)).toHaveAccessibleDescription(/Not correct/)

  await page.getByRole('button', { name: 'Exit study mode' }).click()
  await expect(boxes).toHaveCount(0)
  await expect.poll(() => rowsOf(page)).toHaveLength(4)
})
