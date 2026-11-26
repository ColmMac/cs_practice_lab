import { expect, test, type Locator, type Page } from '@playwright/test'
import { watchForProblems } from './pageProblems'

/**
 * The cross-browser smoke tests: the `firefox` and `webkit` projects run only what is tagged @smoke, and the `app`
 * project runs these in Chromium too. All against the production build under its real CSP.
 */
const ROUTES = ['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer', '/about', '/privacy', '/accessibility']

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const pythonReady = (page: Page) => page.getByRole('status').filter({ hasText: /^Python ready$/ })

for (const path of ROUTES) {
  test(`${path} renders with no console errors or CSP violations`, { tag: '@smoke' }, async ({ page }) => {
    const problems = await watchForProblems(page)
    const response = await page.goto(path)
    expect(response!.status()).toBe(200)
    // the headers under test really are in force
    expect(response!.headers()['content-security-policy']).toContain("script-src 'self'")
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (path === '/trace-table') {
      await expect(pythonReady(page)).toBeVisible({ timeout: 80_000 })
      await expect(traceTable(page).locator('tbody tr').first()).toBeVisible()
    }
    await page.waitForLoadState('networkidle')
    expect(problems).toEqual([])
  })
}

test('Run produces a table for the program in the editor', { tag: '@smoke' }, async ({ page }) => {
  const problems = await watchForProblems(page)
  await page.goto('/trace-table')
  await expect(pythonReady(page)).toBeVisible({ timeout: 80_000 })
  // Run and Cancel are one button: wait for the page's own first run before touching it
  await expect(traceTable(page).locator('tbody tr').first()).toBeVisible()
  // Typed as a user would: in Firefox, `fill()` as the editor's first touch empties it and inserts nothing, though
  // select-all by keyboard, mouse or the browser followed by typing all work.
  await page.locator('.cm-content').click()
  await page.keyboard.press('ControlOrMeta+a')
  await page.keyboard.type('smoke = 6 * 7')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(traceTable(page).getByRole('columnheader', { name: 'smoke' })).toBeVisible()
  await expect(traceTable(page).getByRole('cell', { name: '42', exact: true })).toBeVisible()
  expect(problems).toEqual([])
})

test('the theme toggle switches the theme and the choice survives a reload', { tag: '@smoke' }, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  const problems = await watchForProblems(page)
  await page.goto('/')
  const html = page.locator('html')
  await expect(html).not.toHaveClass(/\bdark\b/)
  const background = () => page.locator('#main').locator('..').evaluate((e) => getComputedStyle(e).backgroundColor)
  const light = await background()

  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(html).toHaveClass(/\bdark\b/)
  await expect.poll(background).not.toBe(light)
  await page.reload()
  await expect(html).toHaveClass(/\bdark\b/)

  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await expect(html).not.toHaveClass(/\bdark\b/)
  expect(problems).toEqual([])
})

test('the nav works from the keyboard alone', { tag: '@smoke' }, async ({ page, browserName }) => {
  const problems = await watchForProblems(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const nav = page.getByRole('navigation', { name: 'Tools' })
  // Like Safari, WebKit leaves links out of the Tab order: Option+Tab reaches them on a Mac, and Playwright's
  // Windows build has no key that does. There the test moves focus itself, so it proves that the links take focus
  // and work from the keyboard, but NOT their Tab order. Every other engine and platform checks the order.
  const skipsLinks = browserName === 'webkit' && process.platform === 'win32'
  const tab = browserName === 'webkit' && process.platform === 'darwin' ? 'Alt+Tab' : 'Tab'
  const moveTo = async (link: Locator) => {
    if (skipsLinks) await link.focus()
    else await page.keyboard.press(tab)
    await expect(link).toBeFocused()
  }

  await moveTo(page.getByRole('link', { name: 'Skip to content' }))
  for (const name of ['CS Practice Lab', 'Trace tables', 'Truth tables']) await moveTo(nav.getByRole('link', { name }))
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/truth-tables$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Truth tables' })).toBeVisible()
  await expect(nav.getByRole('link', { name: 'Truth tables' })).toHaveAttribute('aria-current', 'page')

  // focus stayed on the link, so the next stop is still the next one along
  await moveTo(nav.getByRole('link', { name: 'Number systems' }))
  expect(problems).toEqual([])
})
