import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })

/** Linear search in Study mode: `i = 0` is filled in, and `i` is answered wrong after the first `i = i + 1`. */
async function oneWrongIncrement(page: Page) {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
  await page.getByRole('button', { name: /study/i }).first().click()

  const wrong = traceTable(page).locator('tbody tr[data-line="9"]').first().locator('input[data-study-col="<module>:i"]')
  await wrong.fill('7')
  await page.getByRole('button', { name: 'Check answers' }).click()
  return wrong
}

const callout = (page: Page) => page.getByTestId('why-callout')
const why = (page: Page) => page.getByRole('button', { name: /^Why\? Explain Row \d+ \(line 9\), i$/ }).first()
const reveal = (page: Page) => page.getByRole('button', { name: /^Reveal Row \d+ \(line 9\), i$/ }).first()

test('Why? shows the working without the answer, and Reveal then states it', async ({ page }) => {
  await oneWrongIncrement(page)
  await why(page).click()

  await expect(callout(page)).toContainText('i = i + 1')
  await expect(callout(page)).toContainText('0 + 1')
  await expect(callout(page).locator('[data-part=result]')).toHaveCount(0)
  await expect(callout(page)).not.toContainText('becomes')

  await reveal(page).click()
  await expect(callout(page)).toContainText('So i becomes 1.')
  await expect(callout(page).locator('[data-part=result]')).toHaveText('1')
})

test('Alt+W toggles the explanation from the keyboard and leaves the Tab order alone', async ({ page }) => {
  const wrong = await oneWrongIncrement(page)
  const focusedKey = () => page.evaluate(() => (document.activeElement as HTMLElement).dataset.studyKey ?? '')
  await wrong.focus()
  await page.keyboard.press('Tab')
  const nextWithoutCallout = await focusedKey()

  await wrong.focus()
  await page.keyboard.press('Alt+w')
  await expect(callout(page)).toBeVisible()
  await expect(wrong).toBeFocused()
  await page.keyboard.press('Tab')
  expect(await focusedKey()).toBe(nextWithoutCallout)

  await wrong.focus()
  await page.keyboard.press('Alt+w')
  await expect(callout(page)).toHaveCount(0)
})

test.describe('axe audit with an explanation open', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no violations in ${colorScheme} mode, before and after Reveal`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await oneWrongIncrement(page)
      await why(page).click()
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const audit = () =>
        page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
          return (await axe.run()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => String(n.target)).join(' ; ')}`)
        })
      await expect(callout(page)).toBeVisible()
      expect(await audit()).toEqual([])
      await reveal(page).click()
      await expect(callout(page).locator('[data-part=result]')).toBeVisible()
      expect(await audit()).toEqual([])
    })
  }
})
