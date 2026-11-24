import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('toolbar primitives: Export popover opens, closes on Escape, and the theme toggle flips', async ({ page }) => {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Recursive factorial' })
  await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 80_000 })

  const exportButton = page.getByRole('button', { name: /Export/ })
  await exportButton.click()
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
  await expect(exportButton).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Export' })).toHaveCount(0)

  const html = page.locator('html')
  const wasDark = await html.evaluate((el) => el.classList.contains('dark'))
  await page.getByRole('button', { name: /Switch to (light|dark) mode/ }).click()
  await expect(html).toHaveClass(wasDark ? /^(?!.*\bdark\b)/ : /\bdark\b/)
})

test('the shared primitives keep the trace page styling', async ({ page }) => {
  await page.goto('/trace-table')
  const run = page.getByRole('button', { name: /Run/ }).first()
  await expect(run).toHaveClass(/bg-emerald-700/)
  await expect(page.getByRole('heading', { level: 1, name: 'Trace Table Studio' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Python ready' })).toHaveClass(/rounded px-2 py-1 text-xs font-medium bg-emerald-100/, { timeout: 80_000 })
})
