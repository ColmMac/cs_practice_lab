import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const ROUTES = [
  ['/', 'Tools'],
  ['/trace-table', 'Trace Table Studio'],
  ['/truth-tables', 'Truth tables'],
  ['/number-systems', 'Number systems'],
  ['/sorting-visualizer', 'Sorting & searching'],
] as const

async function axeViolations(page: Page) {
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
    const r = await axe.run()
    return r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
  })
}

test.describe('axe audit of every route and the 404 page', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  for (const theme of ['light', 'dark'] as const) {
    for (const [path] of [...ROUTES, ['/no-such-page']] as const) {
      test(`${path} has no axe violations in ${theme} mode`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
        await page.goto(path)
        await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        if (path === '/trace-table') await expect(page.locator('.cm-content')).toBeVisible()
        expect(await axeViolations(page), `${path} ${theme}`).toEqual([])
      })
    }
  }
})

test.describe('phone width (375 px)', () => {
  test.use({ viewport: { width: 375, height: 800 } })

  for (const [path, heading] of ROUTES) {
    test(`${path}: the nav is usable and nothing scrolls sideways`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const nav = page.getByRole('navigation', { name: 'Tools' })
      for (const name of ['Trace tables', 'Truth tables', 'Number systems', 'Sorting & searching']) {
        const box = await nav.getByRole('link', { name }).boundingBox()
        expect(box, `${name} link`).not.toBeNull()
        expect(box!.x, `${name} starts on screen`).toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width, `${name} ends on screen`).toBeLessThanOrEqual(375)
      }
      await expect(page.getByRole('button', { name: /Switch to (dark|light) mode/ })).toBeInViewport()
      // The page itself must not overflow; wide tables scroll inside their own container.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${heading} horizontal overflow`).toBeLessThanOrEqual(0)
    })
  }
})

test.describe('the trace page in projector mode', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('tts:projector', '1'))
  })

  /** A table with a selected row on screen: the largest text, the highlight and the bar all at once. */
  async function openWithTable(page: Page) {
    await page.goto('/trace-table')
    await expect(page.locator('html')).toHaveClass(/\bprojector\b/)
    const rows = page.getByRole('table', { name: 'Trace table' }).locator('tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 80_000 })
    await rows.nth(1).click()
  }

  test.describe('at phone width (375 px)', () => {
    test.use({ viewport: { width: 375, height: 800 } })

    test('the toggle is on screen and nothing scrolls the page sideways', async ({ page }) => {
      await openWithTable(page)
      const box = await page.getByRole('button', { name: /projector/i }).boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      // `main` is the scroll box on narrow screens: it must not scroll sideways either
      expect(await page.locator('main').evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(0)
    })
  })

  test.describe('axe', () => {
    test.use({ bypassCSP: true })

    for (const theme of ['light', 'dark'] as const) {
      test(`no violations in ${theme} mode`, async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
        await openWithTable(page)
        expect(await axeViolations(page), theme).toEqual([])
      })
    }
  })
})
