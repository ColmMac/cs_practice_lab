import { expect, test, type Page } from '@playwright/test'

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const worksheet = (page: Page) => page.locator('[data-print-page="worksheet"]')
const key = (page: Page) => page.locator('[data-print-page="key"]')

/** 60 loop passes: 120+ table rows, so both parts of the pack run over several sheets. */
const LONG = 'total = 0\nfor i in range(60):\n    total = total + i\nprint(total)\n'
/** Over 300 rows, so the table on screen is windowed. */
const WINDOWED = 'total = 0\nfor i in range(200):\n    total = total + i\nprint(total)\n'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('tts:welcomed', '1')
    // the real dialog can't be driven: keep what matters, the event that builds the print view
    window.print = () => void window.dispatchEvent(new Event('beforeprint'))
  })
})

async function loadPreset(page: Page, label: string, lastOutput: string) {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label })
  await expect(traceTable(page).getByRole('cell', { name: lastOutput, exact: true }).last()).toBeVisible({ timeout: 80_000 })
}

/** Opens the page with `code` as the visitor's saved program, which runs as soon as Python is ready. */
async function loadCode(page: Page, code: string) {
  await page.addInitScript((c) => localStorage.setItem('tts:v1', JSON.stringify({ state: { code: c }, version: 1 })), code)
  await page.goto('/trace-table')
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
}

async function openExport(page: Page) {
  await page.getByRole('button', { name: /export/i }).click()
  return page.getByRole('dialog', { name: 'Export' })
}

async function printPack(page: Page) {
  await (await openExport(page)).getByRole('button', { name: 'Print worksheet + answer key' }).click()
  await expect(worksheet(page)).toHaveCount(1)
}

/** Sheets in a PDF Chromium made: its page objects are written uncompressed. */
const pdfPages = async (page: Page) => (await page.pdf({ format: 'A4' })).toString('latin1').match(/\/Type\s*\/Page(?!s)/g)!.length

test.describe('print pack', () => {
  test('a blank worksheet, a forced page break, then the mark scheme; black on white from the dark theme', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tts:theme', 'dark'))
    await loadPreset(page, 'Digit sum (while, %, //)', '10')
    await printPack(page)
    await page.emulateMedia({ media: 'print' })

    await expect(worksheet(page)).toBeVisible()
    await expect(worksheet(page)).toHaveCSS('break-after', 'page')
    await expect(worksheet(page)).toContainText('while n > 0:')
    const cells = await worksheet(page).locator('tbody td').allTextContents()
    expect(cells).toHaveLength(17 * 5)
    expect(cells.join('')).toBe('')
    await expect(key(page).getByRole('heading', { name: 'Mark scheme' })).toBeVisible()
    await expect(key(page).getByRole('cell', { name: '10', exact: true }).last()).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Tools' })).toBeHidden()

    // nothing behind the sheet keeps its dark screen colour
    const backgrounds = await page.getByTestId('print-region').evaluate((region) => {
      const out: string[] = []
      for (let el: Element | null = region; el; el = el.parentElement) out.push(getComputedStyle(el).backgroundColor)
      return out
    })
    for (const colour of backgrounds) expect(['rgba(0, 0, 0, 0)', 'rgb(255, 255, 255)', 'oklch(1 0 0)']).toContain(colour)

    // a short program: exactly one sheet each. A smoke check of Chromium's paginator, not of a real printer.
    expect(await pdfPages(page)).toBe(2)
  })

  test('a long program runs over several sheets, and the next ordinary print is just the table', async ({ page }) => {
    await loadCode(page, LONG)
    await expect(traceTable(page).getByRole('cell', { name: '1770', exact: true }).last()).toBeVisible()
    await printPack(page)
    await page.emulateMedia({ media: 'print' })
    await expect(worksheet(page).locator('thead')).toHaveCSS('display', 'table-header-group')
    await expect(worksheet(page).locator('tbody tr').first()).toHaveCSS('break-inside', 'avoid')
    expect(await pdfPages(page)).toBeGreaterThanOrEqual(4)

    await page.evaluate(() => {
      window.dispatchEvent(new Event('afterprint'))
      window.dispatchEvent(new Event('beforeprint'))
    })
    await expect(page.locator('[data-print-page]')).toHaveCount(0)
    await expect(page.getByTestId('print-region').locator('table')).toHaveCount(1)
    // the app shell is a screen-height box: it must not clip a long print to one sheet
    expect(await pdfPages(page)).toBeGreaterThanOrEqual(2)
  })
})

test.describe('projector mode', () => {
  const toggle = (page: Page) => page.getByRole('button', { name: /projector/i })
  const fontSize = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
  const CELL = 'table[aria-label="Trace table"] tbody td'
  const HEAD = 'table[aria-label="Trace table"] thead th'

  test('bigger code and table, fewer panels, remembered, and only on the trace page', async ({ page }) => {
    await loadPreset(page, 'Linear search (while + flag)', 'True 2')
    const off = {
      code: await fontSize(page, '.cm-content'),
      cell: await fontSize(page, CELL),
      head: await fontSize(page, HEAD),
    }
    const panels = [
      page.getByLabel(/Program inputs/),
      page.getByRole('region', { name: /Watch expressions/ }),
      page.getByRole('button', { name: /Exam pseudocode/ }),
    ]
    for (const panel of panels) await expect(panel).toBeVisible()

    await toggle(page).click()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle(page)).toHaveCSS('color', /rgb\(255, 255, 255\)|oklch\(1 0 0\)/)
    for (const [name, selector] of [['code', '.cm-content'], ['cell', CELL], ['head', HEAD]] as const) {
      const ratio = (await fontSize(page, selector)) / off[name]
      expect(ratio, name).toBeGreaterThanOrEqual(1.3)
      expect(ratio, name).toBeLessThanOrEqual(1.4)
    }
    for (const panel of panels) await expect(panel).toBeHidden()

    // the selected row gets a bar, and the editor highlights its line
    const row = traceTable(page).locator('tbody tr').nth(2)
    await row.click()
    await expect(row.locator('td').first()).toHaveCSS('box-shadow', /4px 0px 0px 0px inset/)
    await expect(page.locator('.cm-trace-selected')).toHaveCount(1)

    // study answers grow with the text
    await page.getByRole('button', { name: /study mode/i }).click()
    expect(await fontSize(page, 'input[data-study-key]')).toBeGreaterThan(18)
    await page.getByRole('button', { name: 'Exit study mode' }).click()

    await page.reload()
    await expect(toggle(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveClass(/\bprojector\b/)

    // another tool, reached without a reload: untouched
    await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Truth tables' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Truth tables' })).toBeVisible()
    await expect(page.locator('html')).not.toHaveClass(/\bprojector\b/)
    await expect(page.locator('tbody td').first()).toHaveCSS('font-size', '14px')

    await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Trace tables' }).click()
    await expect(page.locator('html')).toHaveClass(/\bprojector\b/)
    await toggle(page).click()
    await expect(page.locator('html')).not.toHaveClass(/\bprojector\b/)
    await expect(page.getByLabel(/Program inputs/)).toBeVisible()
  })

  test('a long, windowed table still reaches its last row after the row height changes', async ({ page }) => {
    await loadCode(page, WINDOWED)
    const total = Number(await traceTable(page).getAttribute('aria-rowcount'))
    expect(total).toBeGreaterThan(300)
    const scroller = page.locator('[data-scroll-parent]')
    const toEnd = () => scroller.evaluate((el) => void (el.scrollTop = el.scrollHeight))
    const last = traceTable(page).locator(`tbody tr[aria-rowindex="${total}"]`)

    for (const pressed of ['true', 'false']) {
      await toEnd()
      await toggle(page).click()
      await expect(toggle(page)).toHaveAttribute('aria-pressed', pressed)
      await expect(async () => {
        await toEnd()
        await expect(last).toBeInViewport({ timeout: 1000 })
      }).toPass()
      expect(await traceTable(page).locator('tbody tr[data-index]').count()).toBeLessThan(total)
    }
  })
})
