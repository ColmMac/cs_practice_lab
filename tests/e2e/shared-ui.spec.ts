import { expect, test, type Locator, type Page } from '@playwright/test'

/** P10: the pieces that used to be copied per tool look and behave the same everywhere. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const studyButton = (page: Page) => page.getByRole('button', { name: /^Study mode/ })

async function openTrace(page: Page) {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
}

const styleOf = (el: Locator, properties: string[]) =>
  el.evaluate((node, names) => {
    const style = getComputedStyle(node)
    return Object.fromEntries(names.map((n) => [n, style.getPropertyValue(n)]))
  }, properties)

const SHARED_KEYS = /^Enter \/ ↓ next · Shift\+Enter \/ ↑ previous · .*Alt\+H hint · Alt\+R reveal/
const legend = (page: Page) => page.locator('p').filter({ hasText: 'Shift+Enter' })

test('each answer grid shows one keyboard legend, and only the trace table lists Tab and Alt+W', async ({ page }) => {
  await openTrace(page)
  await studyButton(page).click()
  await expect(legend(page)).toHaveText(
    'Enter / ↓ next · Shift+Enter / ↑ previous · Tab across (after the last box: Check answers) · Alt+H hint · Alt+R reveal · Alt+W why (wrong answers) · output lines: write \\n between them',
  )
  await expect(legend(page).locator('kbd')).toHaveCount(8)

  await page.goto('/truth-tables?preset=half-adder')
  await studyButton(page).click()
  await expect(legend(page)).toHaveText(SHARED_KEYS)
  await expect(legend(page)).toContainText('reveal · answer with 0, 1, T or F. Changing the expression or options ends study mode.')
  await expect(legend(page)).not.toContainText('Alt+W')

  await page.goto('/number-systems?mode=practice&seed=5')
  await expect(legend(page)).toHaveText(SHARED_KEYS)
  await expect(legend(page)).toContainText('reveal · formatting such as 0b, 0x and spaces is fine.')
  await expect(legend(page)).not.toContainText('Alt+W')
})

test('the Study mode button is the same switch on the trace and truth-table pages, off and on', async ({ page }) => {
  const properties = [
    'background-color',
    'border-top-color',
    'border-top-width',
    'border-radius',
    'color',
    'font-size',
    'font-weight',
    'padding-top',
    'padding-left',
  ]
  const looks = async () => {
    const button = studyButton(page)
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).toBeEnabled()
    await page.mouse.move(0, 0)
    const off = await styleOf(button, properties)
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(button).toHaveText('Study mode: on')
    await expect(button).toHaveAttribute('title', 'Leave study mode')
    await page.mouse.move(0, 0)
    const on = await styleOf(button, properties)
    await expect(button.locator('svg[aria-hidden="true"]')).toHaveCount(1)
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    return { off, on }
  }

  await openTrace(page)
  const trace = await looks()
  await page.goto('/truth-tables?preset=half-adder')
  const truth = await looks()

  expect(truth).toEqual(trace)
  expect(trace.on['background-color']).not.toBe(trace.off['background-color'])
})

test('inline links share one style on the home page, the guides, the trust pages and the 404', async ({ page }) => {
  const properties = ['color', 'text-decoration-line']
  const seen: Record<string, string>[] = []
  const check = async (path: string, link: () => Locator) => {
    await page.goto(path)
    await expect(link()).toBeVisible()
    await page.mouse.move(0, 0)
    seen.push(await styleOf(link(), properties))
  }
  await check('/', () => page.getByRole('link', { name: 'Open Truth tables' }))
  await check('/no-such-page', () => page.getByRole('link', { name: 'Go to the home page' }))
  await check('/about', () => page.getByRole('main').getByRole('link').first())
  await check('/truth-tables', () => page.getByRole('region').filter({ has: page.getByRole('heading', { level: 2 }) }).getByRole('link').first())

  expect(seen[0]!['text-decoration-line']).toBe('underline')
  for (const style of seen) expect(style).toEqual(seen[0])
})

test('every lazy route arrives from the nav and the footer, replacing the loading line', async ({ page }) => {
  await page.goto('/')
  const visit = async (nav: Locator, heading: string) => {
    await nav.click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.getByText('Loading…', { exact: true })).toHaveCount(0)
  }
  const tools = page.getByRole('navigation', { name: 'Tools' })
  await visit(tools.getByRole('link', { name: 'Truth tables' }), 'Truth tables')
  await visit(tools.getByRole('link', { name: 'Number systems' }), 'Number systems')
  await visit(tools.getByRole('link', { name: 'Sorting & searching' }), 'Sorting & searching')
  // the trace page's heading is the site name
  await visit(tools.getByRole('link', { name: 'Trace tables' }), 'CS Practice Lab')
  await expect(page.getByRole('button', { name: 'Run' })).toBeVisible()
  await visit(page.getByRole('contentinfo').getByRole('link', { name: 'About' }), 'About')
  await visit(page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }), 'Privacy')
})

test('the trace and truth-table exports offer the same answer key / worksheet choice', async ({ page }) => {
  const picker = async () => {
    await page.getByRole('button', { name: 'Export' }).click()
    const dialog = page.getByRole('dialog', { name: 'Export' })
    const group = dialog.getByRole('radiogroup', { name: 'As' })
    await expect(group.getByRole('radio')).toHaveText(['Answer key', 'Worksheet'])
    await expect(group.getByRole('radio', { name: 'Answer key' })).toBeChecked()
    await group.getByRole('radio', { name: 'Worksheet' }).click()
    // each tool's default study settings already hide something
    await expect(dialog.getByText(/^Blanks \d+ cells \(the Study mode mask\)\.$/)).toBeVisible()
    await page.keyboard.press('Escape')
  }

  await openTrace(page)
  await picker()
  await page.goto('/truth-tables?preset=half-adder')
  await picker()
})
