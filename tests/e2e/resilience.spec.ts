import { expect, test, type Page } from '@playwright/test'

/** Programs that never finish. Damaged share links are in challenge.spec.ts. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const nav = (page: Page) => page.getByRole('navigation', { name: 'Tools' })
const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })

async function openTracePage(page: Page) {
  await page.goto('/trace-table')
  // the page restores its own table as soon as Python is ready, and a run asked for during that one is ignored
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
  await expect(page.getByRole('status').filter({ hasText: /^Python ready$/ })).toBeVisible()
}

async function run(page: Page, code: string) {
  await page.locator('.cm-content').first().fill(code)
  await page.keyboard.press('Control+Enter')
}

async function expectANormalRun(page: Page) {
  await run(page, 'total = 40 + 2')
  await expect(traceTable(page).getByRole('cell', { name: '42' })).toBeVisible({ timeout: 80_000 })
  await expect(page.getByText(/^Stopped/)).toHaveCount(0)
}

test('while True: pass is stopped with a limit message, and the next run works', async ({ page }) => {
  await openTracePage(page)
  await run(page, 'while True: pass')
  // the step limit or the time limit, whichever the loop reaches first
  await expect(page.getByText(/Stopped(:| after)/).first()).toBeVisible()
  await expectANormalRun(page)
})

test('a program stuck where the tracer can’t reach: the page stays usable until the time limit', async ({ page }) => {
  await openTracePage(page)
  // one line that loops inside C, so only the hard time limit can end it
  await run(page, 'x = sum(range(10**12))')
  const running = page.getByRole('button', { name: /^(Stop|Cancel)/ })
  await expect(running).toBeVisible()

  await nav(page).getByRole('link', { name: 'Truth tables' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Truth tables' })).toBeVisible({ timeout: 2000 })
  await nav(page).getByRole('link', { name: 'Trace tables' }).click()

  await expect(page.getByText(/did not finish within \d/)).toBeVisible()
  await expectANormalRun(page)
})
