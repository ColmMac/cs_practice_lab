import { expect, test, type Page } from '@playwright/test'
import { watchForProblems } from './pageProblems'

/** /accessibility, the privacy summary and the non-affiliation line. This build has no adverts. */

const NON_AFFILIATION = 'Not affiliated with or endorsed by any exam board.'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const footer = (page: Page) => page.getByRole('contentinfo')

test('the footer leads to /accessibility, which says what it aims for and how to report a problem', async ({ page }) => {
  const problems = await watchForProblems(page)
  await page.goto('/')
  await footer(page).getByRole('link', { name: 'Accessibility' }).click()
  await expect(page).toHaveURL(/\/accessibility$/)
  await expect(page).toHaveTitle('Accessibility · CS Practice Lab')
  await expect(page.locator('head link[rel="canonical"]')).toHaveAttribute('href', 'https://cspracticelab.com/accessibility')

  const main = page.getByRole('main')
  await expect(page.getByRole('heading', { level: 1, name: 'Accessibility' })).toBeVisible()
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    'Using a keyboard',
    'Display, motion and sound',
    'Known limitations',
    'Report a problem',
  ])
  await expect(main).toContainText('aims to meet level AA of the Web Content Accessibility Guidelines (WCAG) 2.1')
  for (const text of [/Ctrl\+Enter/, /Alt\+H: hint/, /reduced motion/, /Projector mode/, /CodeMirror/, /PNG image has no text alternative/, /more than 300 rows/]) {
    await expect(main.getByText(text).first()).toBeVisible()
  }
  await expect(main.getByRole('link', { name: 'contact@cspracticelab.com' })).toHaveAttribute('href', 'mailto:contact@cspracticelab.com')
  await expect(main.getByText(/^Last reviewed:/)).toBeVisible()
  await expect(main.locator('time')).toHaveText(/^\d{1,2} \w+ \d{4}$/)
  await expect(main.locator('ins, [data-ad]')).toHaveCount(0)
  expect(problems).toEqual([])
})

// The page tells keyboard users this, so it has to be true of the real editor.
test('Tab indents in the code editor, and Escape then Tab leaves it', async ({ page }) => {
  await page.goto('/trace-table')
  await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 80_000 })
  const editor = page.locator('.cm-content').first()
  const focused = () => editor.evaluate((e) => e === document.activeElement)

  await editor.fill('x = 1')
  await editor.press('Home')
  await editor.press('Tab')
  expect(await focused()).toBe(true)
  await expect(editor).toHaveText(/^\s+x = 1$/)

  for (const keys of ['Tab', 'Shift+Tab']) {
    await editor.focus()
    await page.keyboard.press('Escape')
    await page.keyboard.press(keys)
    expect(await focused(), keys).toBe(false)
  }
})

test('light and dark mode follow the device until the visitor chooses', async ({ page }) => {
  const dark = () => page.evaluate(() => document.documentElement.classList.contains('dark'))
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/accessibility')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await dark()).toBe(true)
  await page.getByRole('button', { name: 'Switch to light mode' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await dark()).toBe(false)
})

test('/privacy opens with a short summary that is true of a build without adverts', async ({ page }) => {
  await page.goto('/privacy')
  const main = page.getByRole('main')
  await expect(main.getByRole('heading', { level: 2 }).first()).toHaveText('In short')
  const summary = main.locator('section').first().getByRole('listitem')
  await expect(summary).toHaveCount(4)
  await expect(summary.nth(0)).toHaveText('We set no cookies.')
  await expect(summary.nth(2)).toContainText('your IP address counts as personal data')
  await expect(summary.nth(2)).toContainText('Cloudflare')
  await expect(summary.nth(2)).toContainText('jsDelivr')
  await expect(summary.nth(3)).toContainText('regulation 6 and Schedule A1, paragraph 4')
  await expect(summary.nth(3)).toContainText('no consent banner')
  expect(await page.context().cookies()).toEqual([])
})

test('using the tools sets no cookies', async ({ page }) => {
  await page.goto('/trace-table')
  await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 80_000 })
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Truth tables' }).click()
  await expect(page.getByRole('table').first()).toBeVisible()
  expect(await page.context().cookies()).toEqual([])
})

test('the footer and /about carry the same non-affiliation line', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('main')).toContainText(NON_AFFILIATION)
  await expect(footer(page).getByText(NON_AFFILIATION, { exact: true })).toBeVisible()
})

test('on a phone the footer wraps cleanly and the new page does not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/accessibility')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const line = (await footer(page).getByText(NON_AFFILIATION).boundingBox())!
  expect(line.x).toBeGreaterThanOrEqual(0)
  expect(line.x + line.width).toBeLessThanOrEqual(375)
})
