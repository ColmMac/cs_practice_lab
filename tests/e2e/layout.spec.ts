import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const TOOL_ROUTES = ['/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer'] as const
const ALL_ROUTES = ['/', ...TOOL_ROUTES, '/about', '/privacy', '/accessibility', '/no-such-page'] as const

const footer = (page: Page) => page.getByRole('contentinfo')
const nav = (page: Page) => page.getByRole('navigation', { name: 'Tools' })
const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
const toBottom = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))

async function ready(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if (path === '/trace-table') await expect(page.locator('.cm-content')).toBeVisible()
}

for (const path of ALL_ROUTES) {
  test(`${path}: one footer with the site links`, async ({ page }) => {
    await ready(page, path)
    await expect(page.locator('footer')).toHaveCount(1)
    const f = footer(page)
    await expect(f).toContainText('CS Practice Lab')
    await expect(f).toContainText(`© ${new Date().getFullYear()}`)
    await expect(f.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    await expect(f.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    await expect(f.getByRole('link', { name: 'Contact' })).toHaveAttribute('href', 'mailto:contact@cspracticelab.com')
    await expect(f.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/ColmMac/cs_practice_lab')
    await expect(f.getByRole('link', { name: 'Buy me a coffee' })).toHaveAttribute('href', 'https://buymeacoffee.com/cs_practice_lab')
  })
}

test.describe('on a desktop screen', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  for (const path of TOOL_ROUTES) {
    test(`${path}: the workspace fills the screen and the footer follows below it`, async ({ page }) => {
      await ready(page, path)
      const box = (await footer(page).boundingBox())!
      expect(box.y, 'the footer starts below the fold').toBeGreaterThanOrEqual(799)
      await toBottom(page)
      await expect(footer(page)).toBeInViewport({ ratio: 1 })
      // the nav stays at the top of the scrolled page
      expect((await nav(page).boundingBox())!.y).toBeCloseTo(0, 0)
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }

  test('a new page starts at its top', async ({ page }) => {
    await ready(page, '/sorting-visualizer')
    await toBottom(page)
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)
    await footer(page).getByRole('link', { name: 'About' }).click()
    await expect(page).toHaveURL(/\/about$/)
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('the trace table scrolls inside its own pane, under a header that stays put', async ({ page }) => {
    const code = ['total = 0', ...Array.from({ length: 58 }, () => 'total = total + 1'), 'print(total)', ''].join('\n')
    await page.addInitScript((c) => localStorage.setItem('tts:v1', JSON.stringify({ state: { code: c }, version: 1 })), code)
    await page.goto('/trace-table')
    await expect(traceTable(page).getByRole('cell', { name: '58' }).last()).toBeVisible({ timeout: 80_000 })

    // the table did not stretch the document: it only scrolls as far as the guide and the footer
    const footerHeight = (await footer(page).boundingBox())!.height
    const guideHeight = (await page.getByRole('region', { name: 'How to complete a trace table' }).boundingBox())!.height
    const pageScroll = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)
    expect(Math.abs(pageScroll - guideHeight - footerHeight)).toBeLessThanOrEqual(2)

    const pane = page.locator('[data-scroll-parent]')
    expect(await pane.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(500)
    await pane.evaluate((el) => void (el.scrollTop = 800))
    await expect
      .poll(() =>
        pane.evaluate((el) => Math.round(el.querySelector('thead')!.getBoundingClientRect().top - el.getBoundingClientRect().top)),
      )
      .toBeLessThanOrEqual(1)
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
  })

  test('the footer is left out of projector mode and of print', async ({ page }) => {
    await ready(page, '/trace-table')
    await expect(footer(page)).toBeVisible()
    await page.getByRole('button', { name: /projector/i }).click()
    await expect(footer(page)).toBeHidden()
    await page.getByRole('button', { name: /projector/i }).click()
    await expect(footer(page)).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(page.locator('footer')).toBeHidden()
  })
})

test.describe('at phone width (375 px)', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  for (const path of ALL_ROUTES) {
    test(`${path}: the footer is reachable and nothing scrolls sideways`, async ({ page }) => {
      await ready(page, path)
      await toBottom(page)
      await expect(footer(page)).toBeInViewport()
      expect(await sideways(page)).toBeLessThanOrEqual(0)
    })
  }

  test('the trace pane is a bounded box after the code, with the footer below it', async ({ page }) => {
    await page.goto('/trace-table?preset=bubble-sort')
    await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
    const code = (await page.getByRole('region', { name: 'Code' }).boundingBox())!
    const pane = (await page.getByRole('region', { name: 'Trace', exact: true }).boundingBox())!
    const foot = (await footer(page).boundingBox())!
    expect(pane.y).toBeGreaterThanOrEqual(code.y + code.height)
    expect(pane.height).toBeCloseTo(480, 0) // 60dvh
    expect(foot.y).toBeGreaterThanOrEqual(pane.y + pane.height)
    expect(await page.locator('[data-scroll-parent]').evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true)
  })
})
