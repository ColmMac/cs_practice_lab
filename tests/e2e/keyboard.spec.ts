import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const boxes = (page: Page) => page.locator('input[data-study-key]')
const checkButton = (page: Page) => page.getByRole('button', { name: 'Check answers' })
const studyToggle = (page: Page) => page.getByRole('button', { name: /study mode/i })

async function linearSearchStudy(page: Page) {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
  await studyToggle(page).click()
  // the leftmost column with a question (`found = True`), though boxes higher up are further right
  await expect(traceTable(page).locator('input[data-study-col="<module>:found"]')).toBeFocused()
}

/** Lines 2 and 3 each work out two values, so they have two boxes side by side. */
const PAIRS = 'a = [3, 4]\nx, y = a[0], a[1]\nx, y = y, x\nprint(x)\n'

async function pairsStudy(page: Page) {
  await page.addInitScript((code) => localStorage.setItem('tts:v1', JSON.stringify({ state: { code }, version: 1 })), PAIRS)
  await page.goto('/trace-table')
  await expect(traceTable(page).getByRole('cell', { name: '[3, 4]' })).toBeVisible({ timeout: 80_000 })
  await studyToggle(page).click()
  await expect(boxes(page).first()).toBeFocused()
}

/** What has focus: the row's source line, and the box's column. */
const focused = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    return { line: el.closest('tr')?.dataset.line ?? null, col: el.dataset.studyCol ?? null }
  })

/** The line number CodeMirror shows beside its selected-row highlight, and whether that line can be seen. */
const editorSelection = (page: Page) =>
  page.evaluate(() => {
    const line = document.querySelector('.cm-trace-selected')
    if (!line) return null
    const box = line.getBoundingClientRect()
    const number = [...document.querySelectorAll('.cm-lineNumbers .cm-gutterElement')].find((g) => {
      const r = g.getBoundingClientRect()
      return r.height > 0 && Math.abs(r.top - box.top) < 3
    })
    const scroller = document.querySelector('.cm-scroller')!
    // visible inside the editor's scroller AND inside the frame around it
    const frames = [scroller, scroller.closest('section[aria-label="Code"] > div')!].map((f) => f.getBoundingClientRect())
    return {
      line: number?.textContent ?? null,
      visible: frames.every((f) => box.top >= f.top - 1 && box.bottom <= f.bottom + 1),
    }
  })

/** The table header is stuck to the top of the pane, and the focused box is wholly below it and inside the pane. */
const clearOfHeader = (page: Page) =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const box = el.getBoundingClientRect()
    const head = el.closest('table')!.tHead!.getBoundingClientRect()
    const frame = el.closest('[data-scroll-parent]')!.getBoundingClientRect()
    // a header that has scrolled away would pass the other two checks without having been tested at all
    const stuck = head.top >= frame.top - 1
    return stuck && box.top >= head.bottom - 1 && box.bottom <= frame.bottom + 1
  })

test('Tab moves along a row, Enter moves down a column, and the editor follows', async ({ page }) => {
  await pairsStudy(page)
  const row = traceTable(page).locator('tbody tr[data-line="2"] input[data-study-key]')
  await expect(row).toHaveCount(2)
  await row.first().focus()
  await expect.poll(() => editorSelection(page)).toEqual({ line: '2', visible: true })
  await page.keyboard.press('Tab')
  await expect(row.nth(1)).toBeFocused()

  await row.first().focus()
  await page.keyboard.press('Enter')
  const below = await focused(page)
  expect(below).toEqual({ line: '3', col: '<module>:x' })
  await expect.poll(async () => (await editorSelection(page))?.line).toBe(below.line)
  await page.keyboard.press('Shift+Enter')
  await expect(row.first()).toBeFocused()
})

test('Tab from the last box reaches Check answers, which sends focus to the first wrong box', async ({ page }) => {
  await linearSearchStudy(page)
  await boxes(page).last().focus()
  await page.keyboard.press('Tab')
  await expect(checkButton(page)).toBeFocused()

  // right, wrong, then everything else blank: the second box is the first wrong one
  await boxes(page).first().fill('True')
  await boxes(page).nth(1).fill('99')
  await checkButton(page).focus()
  await page.keyboard.press('Enter')
  await expect(boxes(page).nth(1)).toBeFocused()
  await expect.poll(async () => (await editorSelection(page))?.line).toBe('9')

  // no trap: Shift+Tab from the first box leaves the table backwards
  await boxes(page).first().focus()
  await page.keyboard.press('Shift+Tab')
  expect((await focused(page)).col).toBeNull()
  await expect(boxes(page).first()).not.toBeFocused()
})

const LONG = ['total = 0', ...Array.from({ length: 58 }, () => 'total = total + 1'), 'print(total)', ''].join('\n')

async function longStudy(page: Page, projector: boolean) {
  await page.addInitScript(
    ([code, on]) => {
      localStorage.setItem('tts:v1', JSON.stringify({ state: { code }, version: 1 }))
      localStorage.setItem('tts:projector', on as string)
    },
    [LONG, projector ? '1' : '0'],
  )
  await page.goto('/trace-table')
  await expect(traceTable(page).getByRole('cell', { name: '58' }).last()).toBeVisible({ timeout: 80_000 })
  await studyToggle(page).click()
  await expect(boxes(page)).toHaveCount(59) // `total = 0` stays filled in
}

for (const projector of [false, true]) {
  test(`a long program: the line scrolls into view and the header never covers a box${projector ? ' (projector)' : ''}`, async ({ page }) => {
    await longStudy(page, projector)
    await boxes(page).last().focus()
    await expect.poll(() => editorSelection(page)).toEqual({ line: '60', visible: true })
    await expect.poll(() => clearOfHeader(page)).toBe(true)

    // upwards is where a sticky header hides things: with the keys that move by script, and with the browser's own Tab
    for (const key of ['ArrowUp', 'Shift+Tab']) {
      await boxes(page).last().focus()
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press(key)
        expect(await clearOfHeader(page), `${key} #${i + 1}`).toBe(true)
      }
    }
    await expect.poll(() => editorSelection(page)).toEqual({ line: '20', visible: true })

    // Check sends focus back up to the first wrong box, far above where we are
    await boxes(page).last().focus()
    await checkButton(page).evaluate((b) => (b as HTMLButtonElement).click())
    await expect(boxes(page).first()).toBeFocused()
    await expect.poll(() => clearOfHeader(page)).toBe(true)
    await expect.poll(() => editorSelection(page)).toEqual({ line: '2', visible: true })
  })
}

test('a wide table scrolls sideways under controls that stay put, and pop-ups open over its header', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 })
  await page.goto('/trace-table?preset=bubble-sort')
  await expect(traceTable(page).getByRole('cell', { name: '[1, 2, 4, 5]' }).last()).toBeVisible({ timeout: 80_000 })
  const pane = page.locator('[data-scroll-parent]')

  // the column picker drops down over the table header: it has to be the thing on top there
  await page.getByRole('button', { name: /^columns/i }).click()
  const onTop = await page.getByRole('dialog').evaluate((dialog) => {
    const d = dialog.getBoundingClientRect()
    const head = document.querySelector('table[aria-label="Trace table"] thead')!.getBoundingClientRect()
    const y = (Math.max(d.top, head.top) + Math.min(d.bottom, head.bottom)) / 2
    return y > d.top && y < d.bottom && dialog.contains(document.elementFromPoint(d.left + d.width / 2, y))
  })
  expect(onTop).toBe(true)
  await page.keyboard.press('Escape')

  await studyToggle(page).click()
  const toolbar = page.getByRole('region', { name: 'Study mode' })
  const left = () => toolbar.evaluate((el) => Math.round(el.getBoundingClientRect().left))
  const before = await left()
  const scrolled = await pane.evaluate((el) => {
    el.scrollLeft = el.scrollWidth
    return el.scrollLeft
  })
  expect(scrolled).toBeGreaterThan(100) // the table really is wider than the pane
  expect(Math.abs((await left()) - before)).toBeLessThanOrEqual(1) // sub-pixel rounding
  await expect(checkButton(page)).toBeInViewport()
})

test('a narrow table gets no sideways scrollbar, and the controls fit inside the pane', async ({ page }) => {
  await linearSearchStudy(page)
  const pane = page.locator('[data-scroll-parent]')
  for (const width of [1600, 1280, 375]) {
    await page.setViewportSize({ width, height: 600 })
    await expect
      .poll(() =>
        pane.evaluate((el) => {
          const bar = el.querySelector('[aria-label="Study mode"]')!.getBoundingClientRect()
          const table = el.querySelector('table')!.offsetWidth
          const fits = bar.right <= el.getBoundingClientRect().left + el.clientWidth + 1
          // only a table that really is wider than the pane may make it scroll sideways
          return { fits, extraScroll: el.scrollWidth - Math.max(el.clientWidth, table) }
        }),
      )
      .toEqual({ fits: true, extraScroll: 0 })
  }
})

test('Ctrl+Enter still runs from an answer box, and focus stays put', async ({ page }) => {
  await linearSearchStudy(page)
  await boxes(page).nth(2).fill('False')
  await page.keyboard.press('Control+Enter')
  await expect(boxes(page).nth(2)).toBeFocused()
  await expect(boxes(page).nth(2)).toHaveValue('False')
})
