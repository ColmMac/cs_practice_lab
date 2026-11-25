import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('on a phone, the menu keeps the preset name and Run lights up for a moment', async ({ page }) => {
  await page.goto('/trace-table')
  await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 60_000 })
  const light = page.getByTestId('ran-light')
  await expect(light).toHaveCount(0, { timeout: 10_000 }) // the page's own first run has finished showing

  const menu = page.getByLabel('Example')
  const run = page.getByRole('button', { name: 'Run', exact: true })
  const before = await run.boundingBox()
  await menu.selectOption({ label: 'Digit sum (while, %, //)' })

  await expect(light).toBeVisible()
  await expect(menu).toHaveValue('digit-sum')
  expect(await run.boundingBox()).toEqual(before) // the toolbar holds still
  await expect(light).toHaveCount(0, { timeout: 10_000 })
  await expect(menu).toHaveValue('digit-sum')

  await run.click()
  await expect(light).toBeVisible()
  await expect(light).toHaveCount(0, { timeout: 10_000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
