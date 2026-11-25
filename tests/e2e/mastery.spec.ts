import { expect, test, type Page } from '@playwright/test'

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const boxes = (page: Page) => page.locator('input[data-study-key]')
const cta = (page: Page) => page.getByRole('link', { name: /^(Practice next|Revisit)/ })
const leaks = (page: Page) => page.evaluate(() => (window as unknown as { openTables: number }).openTables)
const resetLeaks = (page: Page) => page.evaluate(() => ((window as unknown as { openTables: number }).openTables = 0))

/**
 * Linear search, compact, worked by hand, in reading order. The preset's watch `i < len(items)` becomes True when
 * `i` is set on line 4 and never changes again.
 *   line 1 items · 2 target · 3 found · 4 i, watch · 9 i · 9 i · 7 found · 10 output
 */
const ANSWERS = ['[4, 8, 15, 16, 23, 42]', '15', 'False', '0', 'True', '1', '2', 'True', 'True 2']

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tts:welcomed', '1')
    // records any moment the trace table has body rows but nothing to fill in
    const w = window as unknown as { openTables: number }
    w.openTables = 0
    new MutationObserver(() => {
      const table = document.querySelector('table[aria-label="Trace table"]')
      if (table?.querySelector('tbody tr') && !table.querySelector('input[data-study-key]')) w.openTables++
    }).observe(document, { childList: true, subtree: true })
  })
})

const goHome = (page: Page) => page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'CS Practice Lab' }).click()

test('practise the next preset from the home page, master it, and be offered the one after', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('0/6 trace presets mastered')).toBeVisible()
  await expect(cta(page)).toHaveText('Practice next: Linear search')

  await cta(page).click()
  await expect(boxes(page)).toHaveCount(ANSWERS.length, { timeout: 80_000 })
  await expect(page).toHaveURL(/\/trace-table$/)
  expect(await leaks(page)).toBe(0)

  for (const [i, answer] of ANSWERS.entries()) await boxes(page).nth(i).fill(answer)
  await page.getByRole('button', { name: 'Check answers' }).click()
  await expect(page.getByText('Score: 9 / 9 · 100%')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Score' })).toBeFocused()

  await goHome(page)
  await expect(page.getByText('1/6 trace presets mastered')).toBeVisible()
  await expect(page.getByText('1/6 mastered')).toBeVisible()
  await expect(cta(page)).toHaveText('Practice next: Bubble sort')

  // a round of the other tools, and back
  const nav = page.getByRole('navigation', { name: 'Tools' })
  for (const name of ['Truth tables', 'Number systems', 'Sorting & searching', 'Trace tables']) {
    await nav.getByRole('link', { name }).click()
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByRole('contentinfo')).toBeVisible()
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0)
  }
  await goHome(page)
  const badge = page.getByRole('list', { name: 'Tools' }).getByText('1/6 mastered')
  await expect(badge).toBeVisible()

  await page.reload()
  await expect(badge).toBeVisible()
  await expect(page.getByText('1/6 trace presets mastered')).toBeVisible()
})

test('coming back through a practice link never shows the open table left from before', async ({ page }) => {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
  // positive control: the observer does notice an open table
  expect(await leaks(page)).toBeGreaterThan(0)

  await goHome(page) // no reload: the trace tool keeps that table in memory
  await expect(cta(page)).toBeVisible()
  await resetLeaks(page)
  await cta(page).click()
  await expect(boxes(page)).toHaveCount(ANSWERS.length)
  await page.waitForTimeout(1000) // the watch's delayed re-run, if any, has happened
  await expect(boxes(page)).toHaveCount(ANSWERS.length)
  expect(await leaks(page)).toBe(0)
})

test('?study=1 with no valid preset is ignored', async ({ page }) => {
  await page.goto('/trace-table?preset=nope&study=1')
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
  await expect(boxes(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/trace-table$/)
})

const record = (over: object = {}) => ({
  tool: 'trace',
  attempts: 1,
  bestPercent: 100,
  lastPercent: 100,
  mastered: true,
  lastPracticedAt: 1_700_000_000_000,
  ...over,
})

test('a corrupt saved value is ignored', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('hub:mastery:v1', '{"v":1,"records":'))
  await page.goto('/')
  await expect(page.getByText('0/6 trace presets mastered')).toBeVisible()
  await expect(cta(page)).toHaveText('Practice next: Linear search')
})

test('progress saved in another tab shows up, and Reset asks before forgetting it', async ({ page, context }) => {
  await page.goto('/')
  const other = await context.newPage()
  await other.goto('/')
  await other.evaluate(
    (r) => localStorage.setItem('hub:mastery:v1', JSON.stringify({ v: 1, records: { 'trace:linear-search': r } })),
    record(),
  )
  await expect(page.getByText('1/6 trace presets mastered')).toBeVisible()

  const reset = page.getByRole('button', { name: 'Reset my progress' })
  page.once('dialog', (d) => void d.dismiss())
  await reset.click()
  await expect(page.getByText('1/6 trace presets mastered')).toBeVisible()
  page.once('dialog', (d) => void d.accept())
  await reset.click()
  await expect(page.getByText('0/6 trace presets mastered')).toBeVisible()
  await expect(reset).toHaveCount(0)
})

test.describe('with progress saved', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  const seed = (page: Page, theme: string) =>
    page.addInitScript(
      ([t, records]) => {
        localStorage.setItem('tts:theme', t as string)
        localStorage.setItem('hub:mastery:v1', JSON.stringify({ v: 1, records }))
      },
      [theme, { 'trace:linear-search': record(), 'trace:bubble-sort': record({ bestPercent: 40, mastered: false }) }] as const,
    )

  for (const theme of ['light', 'dark'] as const) {
    test(`no axe violations on the home page in ${theme} mode, and no horizontal scroll at 375 px`, async ({ page }) => {
      await seed(page, theme)
      await page.goto('/')
      await expect(page.getByText('1/6 trace presets mastered')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Reset my progress' })).toBeVisible()
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const violations = () =>
        page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
          return (await axe.run()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => String(n.target)).join(' ; ')}`)
        })
      expect(await violations()).toEqual([])
      await page.setViewportSize({ width: 375, height: 800 })
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
      expect(await violations()).toEqual([])
    })
  }
})
