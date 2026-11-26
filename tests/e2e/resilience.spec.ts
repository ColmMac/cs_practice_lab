import { expect, test, type Page } from '@playwright/test'

/**
 * Programs that never finish, a slow Python download, and crashed or missing tool pages. Damaged share links are in
 * challenge.spec.ts.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const nav = (page: Page) => page.getByRole('navigation', { name: 'Tools' })
const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const pythonReady = (page: Page) => page.getByRole('status').filter({ hasText: /^Python ready$/ })

async function openTracePage(page: Page) {
  await page.goto('/trace-table')
  // the page restores its own table as soon as Python is ready, and a run asked for during that one is ignored
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
  await expect(pythonReady(page)).toBeVisible()
}

async function run(page: Page, code: string) {
  await page.locator('.cm-content').first().fill(code)
  // after a hard stop Python starts again, and a press while it loads is dropped
  await expect(pythonReady(page)).toBeVisible({ timeout: 80_000 })
  await page.waitForTimeout(1000) // Run has a one-second cooldown
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

test('presses while Python downloads are dropped: exactly one run once it is ready', async ({ page }) => {
  // count the run requests the page sends its Python worker
  await page.addInitScript(() => {
    const w = window as unknown as { runs: number }
    w.runs = 0
    const post = Worker.prototype.postMessage as (this: Worker, ...args: unknown[]) => void
    Worker.prototype.postMessage = function (this: Worker, ...args: unknown[]) {
      if ((args[0] as { type?: string })?.type === 'run') w.runs++
      post.apply(this, args)
    }
  })
  const runs = () => page.evaluate(() => (window as unknown as { runs: number }).runs)
  let release!: () => void
  const gate = new Promise<void>((resolve) => (release = resolve))
  let held = 0
  await page.context().route('https://cdn.jsdelivr.net/**', async (route) => {
    held++
    await gate
    await route.continue()
  })

  await page.goto('/trace-table')
  const loading = page.getByRole('button', { name: 'Loading Python…', exact: true })
  await expect(loading).toBeDisabled()
  await expect.poll(() => held).toBeGreaterThan(0) // the download really is being held
  const before = await loading.boundingBox()

  for (let i = 0; i < 3; i++) {
    await loading.click({ force: true }) // disabled: Playwright would otherwise wait for it
    await page.keyboard.press('Control+Enter')
    await page.locator('.cm-content').first().press('Control+Enter') // the editor binds it too
    await page.waitForTimeout(1100) // past the cooldown, so only the loading guard can stop the next one
  }
  await expect(loading).toBeVisible() // it never became Cancel
  expect(await runs()).toBe(0)

  release()
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
  await expect(pythonReady(page)).toBeVisible()
  await page.waitForTimeout(1500)
  expect(await runs()).toBe(1)
  const run = page.getByRole('button', { name: 'Run', exact: true })
  await expect(run).toBeEnabled()
  expect(await run.boundingBox()).toEqual(before) // one width for every label
})

test('stored data that crashes the trace page: one press of Reset Tool recovers', async ({ page }) => {
  // No real stored value can do this today (sanitizeWorkspace drops bad data), so the fault is planted: the page's
  // own run signature throws for as long as the stored program is the one in memory.
  await page.addInitScript((workspace) => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('tts:v1', workspace)
      localStorage.setItem('hub:mastery:v1', 'keep me')
      localStorage.setItem('hub:truth:last', 'A AND B')
    }
    const stringify = JSON.stringify
    JSON.stringify = function (value: unknown, ...rest: []) {
      if (Array.isArray(value) && value[0] === '# CORRUPTED') throw new Error('planted fault')
      return stringify(value, ...rest)
    } as typeof JSON.stringify
  }, JSON.stringify({ state: { code: '# CORRUPTED' }, version: 1 }))

  await page.goto('/trace-table')
  const panel = page.getByRole('alert')
  await expect(panel.getByRole('heading', { level: 1, name: 'Trace tables stopped working' })).toBeFocused()
  await expect(page).toHaveTitle('Trace tables | CS Practice Lab')
  expect((await page.getByRole('main').boundingBox())!.height).toBeGreaterThanOrEqual(page.viewportSize()!.height)
  await page.reload() // the fault is in what is stored, so reloading alone does not help
  await expect(panel).toBeVisible()

  await panel.getByRole('button', { name: 'Reset Tool' }).click()
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
  await expect(panel).toHaveCount(0)
  const kept = await page.evaluate(() => [localStorage.getItem('hub:mastery:v1'), localStorage.getItem('hub:truth:last')])
  expect(kept).toEqual(['keep me', 'A AND B'])
  expect(await page.evaluate(() => localStorage.getItem('tts:v1') ?? '')).not.toContain('CORRUPTED')

  await page.reload()
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
})

test('a tool whose chunk will not load: the nav still works, and Reset Tool reloads the page', async ({ page }) => {
  const chunk = '**/assets/TruthTablePage-*.js'
  await page.route(chunk, (route) => route.fulfill({ status: 404, body: '' }))
  await page.goto('/number-systems?tab=practice')
  await nav(page).getByRole('link', { name: 'Truth tables' }).click()
  const panel = page.getByRole('alert')
  await expect(panel).toContainText('This page did not load')

  // another tool is not stuck with this one's panel
  await nav(page).getByRole('link', { name: 'Sorting & searching' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Sorting & searching' })).toBeVisible()
  await expect(panel).toHaveCount(0)

  await nav(page).getByRole('link', { name: 'Truth tables' }).click()
  await expect(panel).toBeVisible()
  await page.unroute(chunk)
  await page.evaluate(() => ((window as unknown as { sameDocument: boolean }).sameDocument = true))
  await panel.getByRole('button', { name: 'Reset Tool' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Truth tables' })).toBeVisible()
  expect(await page.evaluate(() => 'sameDocument' in window)).toBe(false)
})
