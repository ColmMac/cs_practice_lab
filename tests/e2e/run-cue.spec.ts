import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 375, height: 812 } })

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('on a phone, the menu keeps the preset name and only a press of Run lights the button', async ({ page }) => {
  // remember every time the button lights, however briefly
  await page.addInitScript(() => {
    const w = window as unknown as { lights: number }
    w.lights = 0
    new MutationObserver((records) => {
      for (const r of records) if ((r.target as Element).hasAttribute('data-lit')) w.lights++
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-lit'] })
  })
  const lights = () => page.evaluate(() => (window as unknown as { lights: number }).lights)

  await page.goto('/trace-table')
  const table = page.getByRole('table', { name: 'Trace table' })
  await expect(table).toBeVisible({ timeout: 60_000 })
  expect(await lights()).toBe(0) // the page's own first run

  const menu = page.getByLabel('Example')
  await menu.selectOption({ label: 'Digit sum (while, %, //)' })
  await expect(table.getByRole('columnheader', { name: 'digit' })).toBeVisible()
  await expect(menu).toHaveValue('digit-sum')
  expect(await lights()).toBe(0) // loading a preset is not a press of Run

  const run = page.getByRole('button', { name: 'Run', exact: true })
  const before = await run.boundingBox()
  await run.click()
  await expect.poll(lights).toBe(1)
  await expect(run).not.toHaveAttribute('data-lit') // and it is short
  expect(await run.boundingBox()).toEqual(before) // the toolbar holds still

  await page.waitForTimeout(1100) // past the cooldown
  await page.keyboard.press('Control+Enter')
  await expect.poll(lights).toBe(2)
  await page.keyboard.press('Control+Enter') // inside the cooldown: ignored
  await page.waitForTimeout(500)
  expect(await lights()).toBe(2)

  await expect(menu).toHaveValue('digit-sum')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
})
