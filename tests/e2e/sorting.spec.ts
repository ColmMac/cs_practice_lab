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
const step = (page: Page) => page.getByRole('button', { name: /^Step$/ })
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

const quizMode = (page: Page) => page.getByRole('radio', { name: 'Quiz' }).click()
const feedback = (page: Page, id: string) => page.locator(`#study-msg-${id}`)

test('quiz: a right and a wrong answer on the bubble sort passes, and nothing leaks before Reveal', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await quizMode(page)
  await expect(page.getByTestId('quiz-prompt')).toHaveText('Start from [5, 1, 4, 2, 8]. What is the whole list after pass 1?')
  // The answers are hidden while questions are open: no pass table, no whole-run summary, no playback.
  await expect(page.getByRole('heading', { name: 'Pass history' })).toHaveCount(0)
  await expect(page.getByText(/^Whole run/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Step$/ })).toHaveCount(0)
  expect(await values(page)).toEqual([5, 1, 4, 2, 8])
  await expect(page.getByRole('button', { name: /^Continue$/ })).toBeDisabled()

  // Wrong (unchanged list): graded, and the message does not give the answer away.
  await page.getByRole('textbox', { name: 'Your list' }).fill('5, 1, 4, 2, 8')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q1')).toContainText('Not correct')
  await expect(feedback(page, 'q1')).not.toContainText('[1, 4, 2, 5, 8]')
  await expect(feedback(page, 'q1')).not.toContainText('1, 4, 2, 5, 8')

  // Retry and get it right (hand-worked: 5>1 swap, 5>4 swap, 5>2 swap, 5<8).
  await page.getByRole('textbox', { name: 'Your list' }).fill('1, 4, 2, 5, 8')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q1')).toContainText('Correct')
  await page.getByRole('button', { name: /^Continue$/ }).click()

  // Question 2 starts from the previous answer; the stage still shows the pre-pass list.
  await expect(page.getByTestId('quiz-prompt')).toContainText('Start from [1, 4, 2, 5, 8]')
  expect(await values(page)).toEqual([1, 4, 2, 5, 8])
  await page.getByRole('textbox', { name: 'Your list' }).fill('1, 2, 4, 5, 8')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q2')).toContainText('Correct')
  await page.getByRole('button', { name: /^Continue$/ }).click()

  // Question 3: reveal it instead; the answer appears only now, and it is not scored.
  await expect(page.getByTestId('quiz-prompt')).toContainText('after pass 3')
  await expect(page.getByTestId('revealed-cell')).toHaveCount(0)
  await page.getByRole('button', { name: /^Reveal/ }).click()
  await expect(page.getByTestId('revealed-cell')).toContainText('[1, 2, 4, 5, 8]')
  await page.getByRole('button', { name: 'Finish' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Score:' })).toContainText('2 / 2')
  await expect(page.getByText('1 revealed (not scored)')).toBeVisible()
  // The history table is back once the quiz is over.
  await expect(page.getByRole('heading', { name: 'Pass history' })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByTestId('quiz-prompt')).toContainText('after pass 1')
})

test('quiz: binary search asks for mid, with the keyboard contract, and linear search has no quiz', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await algo(page, 'Binary search')
  await page.getByLabel('Example').selectOption({ label: SEARCH_LIST })
  await page.getByLabel(/^Target/).fill('43')
  await quizMode(page)
  await expect(page.getByTestId('quiz-prompt')).toContainText('indices 0 to 7')

  await page.getByRole('textbox', { name: 'Your index' }).fill('4') // wrong: floor(7 / 2) = 3
  await page.keyboard.press('Alt+h')
  await expect(page.getByText(/Hint: mid = /)).toBeVisible()
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q1')).toContainText('Round the middle down') // ceil(3.5) = 4
  await page.getByRole('textbox', { name: 'Your index' }).fill('3')
  await page.keyboard.press('Enter') // Enter moves on from the last box to Check answer
  await expect(page.getByRole('button', { name: 'Check answer' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(feedback(page, 'q1')).toContainText('Correct')
  await page.getByRole('button', { name: /^Continue$/ }).click()

  // 23 < 43, so low = 4, high = 7, mid = 5.
  await expect(page.getByTestId('quiz-prompt')).toContainText('The last probe was index 3, which held 23; that is less than 43.')
  await page.getByRole('textbox', { name: 'Your index' }).fill('5')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q2')).toContainText('Correct')

  await algo(page, 'Linear search')
  await expect(page.getByText(/nothing to predict/)).toBeVisible()
  await page.getByRole('radio', { name: 'Watch' }).click()
  await expect(page.getByRole('button', { name: /^Step$/ })).toBeVisible()
})

test('a bubble sort deep link and the preset give the hand-checked pass table, and the URL follows the page', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  expect(page.url()).not.toContain('?') // a plain page keeps a plain URL
  await algo(page, 'Insertion sort')
  await expect(page).toHaveURL(/\?algo=insertion$/)
  await page.getByLabel(/^List/).fill('9, 7, 5')
  await expect(page).toHaveURL(/algo=insertion&data=9%2C7%2C5/)
  await algo(page, 'Bubble sort')
  await page.getByLabel('Example').selectOption({ label: 'Textbook: 5, 1, 4, 2, 8' })
  await expect(page).not.toHaveURL(/\?/)

  await page.goto('/sorting-visualizer?algo=bubble&data=5,1,4,2,8')
  expect(await historyRows(page)).toEqual([
    ['Start', '5', '1', '4', '2', '8', '', ''],
    ['1', '1', '4', '2', '5', '8', '4', '3'],
    ['2', '1', '2', '4', '5', '8', '3', '1'],
    ['3', '1', '2', '4', '5', '8', '2', '0'],
  ])
})

test('the binary search deep link shows the mid sequence 3, 5, 6, 7', async ({ page }) => {
  await page.goto('/sorting-visualizer?algo=binary&data=3,9,10,23,27,38,43,82&target=82')
  await expect(page.getByLabel('Algorithm')).toHaveValue('binary')
  await expect(page.getByLabel(/^Target/)).toHaveValue('82')
  const table = page.getByRole('table', { name: /Binary search for 82/ })
  const mids = await table.locator('tbody tr').evaluateAll((rows) =>
    rows.map((r) => r.querySelectorAll('td')[3]?.textContent?.trim()),
  )
  expect(mids).toEqual(['3', '5', '6', '7'])
})

test('bad link parameters fall back to the defaults', async ({ page }) => {
  await page.goto('/sorting-visualizer?algo=nope&data=1,x&target=zz&quiz=maybe')
  await expect(page.getByLabel('Algorithm')).toHaveValue('bubble')
  expect(await values(page)).toEqual([5, 1, 4, 2, 8])
  await expect(page.getByRole('radio', { name: 'Watch' })).toBeChecked()
})

test('the quiz deep link opens in quiz mode: one right answer, one wrong', async ({ page }) => {
  await page.goto('/sorting-visualizer?quiz=1')
  await expect(page.getByRole('radio', { name: 'Quiz' })).toBeChecked()
  await expect(page.getByTestId('quiz-prompt')).toContainText('after pass 1')

  await page.getByRole('textbox', { name: 'Your list' }).fill('1, 4, 2, 5, 8')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q1')).toContainText('Correct')
  await page.getByRole('button', { name: /^Continue$/ }).click()

  await page.getByRole('textbox', { name: 'Your list' }).fill('1, 4, 2, 5, 8')
  await page.getByRole('button', { name: 'Check answer' }).click()
  await expect(feedback(page, 'q2')).toContainText('Not correct')

  // Turning the quiz off and on again is reflected in the link.
  await expect(page).toHaveURL(/quiz=1/)
  await page.getByRole('radio', { name: 'Watch' }).click()
  await expect(page).not.toHaveURL(/quiz/)
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
      await page.getByLabel(/^List/).fill('5, 1, 4, 2, 8')
      await algo(page, 'Bubble sort')
      await page.getByRole('radio', { name: 'Quiz' }).click()
      await audit('quiz question')
      await page.getByRole('textbox', { name: 'Your list' }).fill('5, 1, 4, 2, 8')
      await page.getByRole('button', { name: 'Check answer' }).click()
      await audit('quiz graded wrong')
      await page.getByRole('button', { name: /^Reveal/ }).click()
      await page.getByRole('button', { name: /^Continue$/ }).click()
      await audit('quiz next question')
      await page.goto('/sorting-visualizer?algo=binary&data=3,9,10,23,27,38,43,82&target=82&quiz=1')
      await expect(page.getByRole('radio', { name: 'Quiz' })).toBeChecked()
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' }) // a new page load drops axe
      await audit('deep link quiz')
    })
  }
})

test.describe('random lists', () => {
  const newList = (page: Page) => page.getByRole('button', { name: 'New random list' })
  const typed = async (page: Page) => (await page.locator('#sort-list').inputValue()).split(', ').map(Number)
  const inversions = (a: number[]) => a.reduce((n, v, i) => n + a.slice(i + 1).filter((w) => v > w).length, 0)

  test('25 sorting lists in a row are never sorted and always need several swaps', async ({ page }) => {
    await page.goto('/sorting-visualizer')
    const seen = new Set<string>()
    for (let i = 0; i < 25; i++) {
      const before = await page.locator('#sort-list').inputValue()
      await newList(page).click()
      await expect(page.locator('#sort-list')).not.toHaveValue(before)
      const list = await typed(page)
      seen.add(list.join())
      expect(new Set(list).size).toBe(list.length)
      expect(inversions(list)).toBeGreaterThanOrEqual(3)
      expect(await values(page)).toEqual(list)
    }
    expect(seen.size).toBeGreaterThan(20)
  })

  for (const [name, minIndex] of [['Linear search', 2], ['Binary search', 1]] as const) {
    test(`${name}: 20 random targets are never at the start`, async ({ page }) => {
      await page.goto('/sorting-visualizer')
      await algo(page, name)
      for (let i = 0; i < 20; i++) {
        const before = await page.locator('#sort-list').inputValue()
        await newList(page).click()
        await expect(page.locator('#sort-list')).not.toHaveValue(before)
        const list = await typed(page)
        const at = list.indexOf(Number(await page.getByLabel(/^Target/).inputValue()))
        expect(at).toBeGreaterThanOrEqual(minIndex)
        if (name === 'Binary search') {
          expect(list.every((v, k) => k === 0 || list[k - 1]! < v)).toBe(true)
          expect(at).not.toBe(Math.floor((list.length - 1) / 2))
        }
        await expect(page.locator('#sort-list-err')).toHaveText('')
      }
    })
  }

  test('an already sorted list has no sorting quiz, and a random list brings one back', async ({ page }) => {
    await page.goto('/sorting-visualizer?data=1,2,3,4,5&quiz=1')
    await expect(page.getByText(/already in order, so there is nothing to sort/)).toBeVisible()
    await expect(page.getByTestId('quiz-prompt')).toHaveCount(0)
    await newList(page).click()
    await expect(page.getByTestId('quiz-prompt')).toContainText('after pass 1')
  })
})
