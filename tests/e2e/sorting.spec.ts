import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const values = (page: Page) =>
  page.getByTestId('card').evaluateAll((els) =>
    els
      .map((e) => ({ pos: Number(e.getAttribute('data-pos')), value: Number(e.getAttribute('data-value')) }))
      .sort((a, b) => a.pos - b.pos)
      .map((c) => c.value),
  )

const algo = (page: Page, name: string) => page.getByLabel('Algorithm').selectOption({ label: name })
const step = (page: Page) => page.getByRole('button', { name: /^Step ▶/ })
const SEARCH_LIST = 'Sorted for searching: 3, 9, 10, 23, 27, 38, 43, 82'

test('the route renders with the textbook list and the first steps are narrated', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await expect(page.getByRole('heading', { level: 1, name: 'Sorting & searching' })).toBeVisible()
  await expect(page).toHaveTitle(/Sorting & searching/)
  expect(await values(page)).toEqual([5, 1, 4, 2, 8])
  await expect(page.getByTestId('caption')).toContainText('Ready')
  await expect(page.getByRole('button', { name: /Step back/ })).toBeDisabled()

  await step(page).click()
  await expect(page.getByTestId('caption')).toHaveText('Compare 5 and 1: 5 is bigger, so swap them.')
  await expect(page.getByTestId('comparisons')).toHaveText('1')
  await step(page).click()
  await expect(page.getByTestId('caption')).toHaveText('Swap index 0 and index 1.')
  expect(await values(page)).toEqual([1, 5, 4, 2, 8])
  await expect(page.getByTestId('moves')).toHaveText('1')

  await page.getByRole('button', { name: /Step back/ }).click()
  expect(await values(page)).toEqual([5, 1, 4, 2, 8])
  await expect(page.getByTestId('moves')).toHaveText('0')
})

test('state is shown by a word as well as colour', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await step(page).click()
  const first = page.getByTestId('card').first()
  await expect(first).toHaveAttribute('data-mark', 'compare')
  await expect(first).toContainText('Comparing')
  await expect(first).toHaveAttribute('aria-label', 'index 0, value 5, Comparing')
})

test('play runs to the end and sorts; reset returns to the start', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await page.getByRole('radiogroup', { name: 'Speed' }).getByRole('radio', { name: 'Fast' }).click()
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Replay' })).toBeVisible({ timeout: 20_000 })
  expect(await values(page)).toEqual([1, 2, 4, 5, 8])
  await expect(page.getByTestId('caption')).toContainText('Sorted.')
  for (const c of await page.getByTestId('card').all()) await expect(c).toHaveAttribute('data-mark', 'sorted')

  await page.getByRole('button', { name: 'Reset' }).click()
  expect(await values(page)).toEqual([5, 1, 4, 2, 8])
  await expect(page.getByTestId('caption')).toContainText('Ready')
})

test('pause stops playback', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await page.getByRole('button', { name: 'Pause' }).click()
  const progress = page.getByText(/^Step \d+ of \d+$/)
  const shown = await progress.textContent()
  await page.waitForTimeout(1200)
  await expect(progress).toHaveText(shown!)
})

test('insertion sort lifts the key and merge sort narrates splits', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await algo(page, 'Insertion sort')
  await step(page).click()
  await expect(page.getByTestId('caption')).toContainText('with the key 1')
  await expect(page.locator('[data-mark="held"]')).toContainText('Key')

  await algo(page, 'Merge sort')
  await step(page).click()
  await expect(page.getByTestId('caption')).toHaveText('Split indices 0 to 4 into indices 0 to 2 and indices 3 to 4.')
  await expect(page.getByTestId('card').first()).toContainText('In play')
})

test('binary search discards the ruled-out half and finds the target', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await algo(page, 'Binary search')
  await page.getByLabel('Example').selectOption({ label: SEARCH_LIST })
  await page.getByLabel(/^Target/).fill('38')
  await step(page).click()
  await expect(page.getByTestId('caption')).toContainText('middle is index 3: 23 is less than 38')
  await expect(page.getByTestId('card').nth(3)).toHaveAttribute('data-mark', 'mid')
  await step(page).click()
  await expect(page.getByTestId('card').first()).toHaveAttribute('data-mark', 'discarded')
  await expect(page.getByTestId('card').first()).toContainText('Ruled out')
  await step(page).click()
  await expect(page.getByTestId('caption')).toHaveText('Found 38 at index 5.')
  await expect(page.getByTestId('card').nth(5)).toHaveAttribute('data-mark', 'found')
})

test('linear search finds a target in an unsorted list', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await algo(page, 'Linear search')
  await page.getByLabel(/^Target/).fill('4')
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByTestId('caption')).toHaveText('Found 4 at index 2.', { timeout: 20_000 })
})

test('invalid input shows an error and disables playback; binary search offers to sort the list', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await page.getByLabel(/^List/).fill('5, x, 3')
  await expect(page.locator('#sort-list-err')).toContainText('not a whole number')
  await expect(page.getByLabel(/^List/)).toHaveAttribute('aria-invalid', 'true')
  await expect(step(page)).toBeDisabled()
  await page.getByLabel(/^List/).fill('5')
  await expect(page.locator('#sort-list-err')).toContainText('at least 2')
  await page.getByLabel(/^List/).fill('1000, 2')
  await expect(page.locator('#sort-list-err')).toContainText('outside')

  await page.getByLabel(/^List/).fill('9, 3, 7')
  await algo(page, 'Binary search')
  await expect(page.locator('#sort-list-err')).toContainText('needs a sorted list')
  await page.getByRole('button', { name: 'Sort the list' }).click()
  await expect(page.getByLabel(/^List/)).toHaveValue('3, 7, 9')
  await expect(page.locator('#sort-list-err')).toHaveText('')
  await expect(step(page)).toBeEnabled()
})

test('changing the list goes back to the start', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await step(page).click()
  await page.getByLabel(/^List/).fill('3, 2, 1')
  await expect(page.getByTestId('caption')).toContainText('Ready')
  expect(await values(page)).toEqual([3, 2, 1])
})

const historyRows = async (page: Page) => {
  const rows = page.getByRole('table', { name: /after each pass/ }).locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  return rows.evaluateAll((trs) =>
    trs.map((tr) => Array.from(tr.querySelectorAll('td')).slice(1).map((td) => td.textContent ?? '')),
  )
}

test('the pass table lists every pass and follows the visualiser', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  expect(await historyRows(page)).toEqual([
    ['Start', '5', '1', '4', '2', '8', '', ''],
    ['1', '1', '4', '2', '5', '8', '4', '3'],
    ['2', '1', '2', '4', '5', '8', '3', '1'],
    ['3', '1', '2', '4', '5', '8', '2', '0'],
  ])
  const current = page.locator('tr[aria-current="step"]')
  await expect(current).toContainText('Start')
  await step(page).click()
  await expect(current).toHaveCount(1)
  await expect(current.locator('td').nth(1)).toHaveText('1') // pass 1 is under way
  for (let i = 0; i < 8; i++) await step(page).click() // finish pass 1, start pass 2
  await expect(current.locator('td').nth(1)).toHaveText('2')
  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(current.locator('td').nth(1)).toHaveText('Start')
})

test('binary search probes show low, mid and high, and the row follows the step', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await algo(page, 'Binary search')
  await page.getByLabel('Example').selectOption({ label: SEARCH_LIST })
  await page.getByLabel(/^Target/).fill('82')
  const table = page.getByRole('table', { name: /Binary search for 82/ })
  await expect(table.locator('thead th')).toHaveText(['Current', 'Probe', 'Low', 'Mid', 'High', 'Value at mid', 'Result'])
  const body = table.locator('tbody tr')
  await expect(body).toHaveCount(4)
  await expect(body.nth(0)).toContainText('23 < 82: search right')
  await expect(body.nth(3)).toContainText('Equal: found')
  await expect(table.locator('tr[aria-current="step"]')).toHaveCount(0)
  await step(page).click()
  await expect(table.locator('tr[aria-current="step"]')).toContainText('23')
  await step(page).click()
  await expect(table.locator('tr[aria-current="step"]')).toContainText('38')
})

test('the pass table exports as a CSV matching what is shown', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await page.getByRole('button', { name: /Export/ }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Download \.csv/ }).click(),
  ])
  expect(download.suggestedFilename()).toBe('bubble-sort-passes.csv')
  const text = (await readFile((await download.path())!, 'utf8')).replace(/^\uFEFF/, '')
  expect(text.trim().split(/\r?\n/)).toEqual([
    'Pass,[0],[1],[2],[3],[4],Compares,Swaps',
    'Start,5,1,4,2,8,,',
    '1,1,4,2,5,8,4,3',
    '2,1,2,4,5,8,3,1',
    '3,1,2,4,5,8,2,0',
  ])
})

test.describe('axe audit on the real page', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  for (const theme of ['light', 'dark'] as const) {
    test(`no axe violations in ${theme} mode`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
      await page.goto('/sorting-visualizer')
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
      await expect(page.getByRole('heading', { level: 1, name: 'Sorting & searching' })).toBeVisible()
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const audit = async (label: string) => {
        const results = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
          const r = await axe.run()
          return r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
        })
        expect(results, `${label} (${theme})`).toEqual([])
      }
      await audit('start')
      await step(page).click()
      await audit('comparing')
      await step(page).click()
      await audit('swapped')
      await algo(page, 'Insertion sort')
      await step(page).click()
      await audit('held key')
      await algo(page, 'Merge sort')
      await step(page).click()
      await audit('merge split')
      await algo(page, 'Binary search')
      await page.getByLabel('Example').selectOption({ label: SEARCH_LIST })
      await page.getByLabel(/^Target/).fill('38')
      for (let i = 0; i < 2; i++) await step(page).click()
      await audit('discarded and middle')
      await step(page).click()
      await audit('found')
      await page.getByLabel(/^List/).fill('9, x')
      await audit('error')
    })
  }
})
