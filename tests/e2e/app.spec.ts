import { expect, test, type Page } from '@playwright/test'

/** Load a preset by its visible title; loading one runs it. */
async function loadPreset(page: Page, title: string) {
  await page.getByLabel('Example').selectOption({ label: title })
}

test.beforeEach(async ({ page }) => {
  // Skip the first-visit welcome note so it can't cover anything.
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('loads Python, runs a preset and shows the right table', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto('/trace-table')
  await expect(page.getByRole('status').filter({ hasText: 'Python ready' })).toBeVisible({ timeout: 80_000 })

  await loadPreset(page, 'Digit sum (while, %, //)')
  const table = page.getByRole('table', { name: 'Trace table' })
  await expect(table).toBeVisible()
  // digit_sum(1234) = 10: the golden table ends with total 10 and the output line.
  await expect(table.getByRole('cell', { name: '1234' }).first()).toBeVisible()
  await expect(table.getByRole('cell', { name: '10' }).first()).toBeVisible()

  expect(errors, 'no page or CSP errors').toEqual([])
})

test('recursion preset shows return values', async ({ page }) => {
  await page.goto('/trace-table')
  await loadPreset(page, 'Recursive factorial')
  const table = page.getByRole('table', { name: 'Trace table' })
  await expect(table.getByRole('cell', { name: '24' }).first()).toBeVisible({ timeout: 80_000 })
  await expect(table.getByRole('columnheader', { name: /Return/ })).toBeVisible()
})

test('Study mode hides answers and grades a typed answer', async ({ page }) => {
  await page.goto('/trace-table')
  await loadPreset(page, 'Digit sum (while, %, //)')
  const table = page.getByRole('table', { name: 'Trace table' })
  await expect(table.getByRole('cell', { name: '1234' }).first()).toBeVisible({ timeout: 80_000 })

  await page.getByRole('button', { name: /study/i }).first().click()
  // Answer boxes replace the written cells.
  await expect(page.locator('table input').first()).toBeVisible()
  expect(await page.locator('table input').count()).toBeGreaterThan(0)
})

test('Markdown export downloads a file', async ({ page }) => {
  await page.goto('/trace-table')
  await loadPreset(page, 'Digit sum (while, %, //)')
  await expect(page.getByRole('table', { name: 'Trace table' }).getByRole('cell', { name: '1234' }).first()).toBeVisible({
    timeout: 80_000,
  })

  await page.getByRole('button', { name: /export/i }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /download.*markdown|markdown.*download|\.md/i }).first().click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^trace-table.*\.md$/)
})

test('theme toggle applies the dark class and persists across a reload (tts:theme)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/trace-table')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/dark/)

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(html).toHaveClass(/dark/)
  expect(await page.evaluate(() => localStorage.getItem('tts:theme'))).toBe('dark')

  await page.reload()
  await expect(html).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
})
