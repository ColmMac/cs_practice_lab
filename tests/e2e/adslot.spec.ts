import { expect, test, type Page } from '@playwright/test'
import { encodeShare } from '../../src/core/share/urlState'
import { defaultWorkspace } from '../../src/core/workspace'
import { watchForProblems } from './pageProblems'

/**
 * The ad slot: where it sits, what it never covers and when it is gone. The default build has no AdSense IDs, so it
 * shows the house card. The group tagged @ads is the `ads` Playwright project: a second build with fake IDs
 * (playwright.config.ts), where every outside request is answered or blocked here, so no test traffic reaches Google.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const SLOT_ROUTES = ['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer', '/about']
const BOX_HEIGHT = 122
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 375, height: 812 },
]

const slot = (page: Page) => page.getByTestId('ad-slot')
const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })

async function ready(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if (path.startsWith('/trace-table')) await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
}

/** What the slot covers: controls, editors and tables, each clipped to the scroll boxes it is inside. */
const overlaps = (page: Page) =>
  page.evaluate(() => {
    const ad = document.querySelector('[data-testid="ad-slot"]')!
    const a = ad.getBoundingClientRect()
    const found: string[] = []
    for (const el of document.querySelectorAll('button, input, select, textarea, a[href], summary, .cm-editor, table')) {
      if (ad.contains(el) || !el.checkVisibility()) continue
      let { top, bottom, left, right } = el.getBoundingClientRect()
      for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
        if (getComputedStyle(p).overflow === 'visible') continue
        const c = p.getBoundingClientRect()
        top = Math.max(top, c.top)
        bottom = Math.min(bottom, c.bottom)
        left = Math.max(left, c.left)
        right = Math.min(right, c.right)
      }
      if (right <= left || bottom <= top) continue
      if (left < a.right - 0.5 && right > a.left + 0.5 && top < a.bottom - 0.5 && bottom > a.top + 0.5) {
        found.push(`${el.tagName} ${el.textContent?.slice(0, 40)}`)
      }
    }
    return found
  })

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}×${viewport.height})`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    for (const path of SLOT_ROUTES) {
      test(`${path}: one reserved box with the house card, covering nothing`, async ({ page }) => {
        const google: string[] = []
        page.on('request', (r) => /googlesyndication|doubleclick/.test(r.url()) && google.push(r.url()))
        await ready(page, path)
        await expect(slot(page)).toHaveCount(1)
        await slot(page).scrollIntoViewIfNeeded()
        await expect(slot(page)).toBeVisible()
        const box = (await slot(page).boundingBox())!
        expect(box.height).toBe(BOX_HEIGHT)
        expect(box.width).toBeGreaterThan(250)
        await expect(slot(page).getByTestId('house-card').getByRole('link')).toBeVisible()
        await expect(page.locator('ins.adsbygoogle')).toHaveCount(0)
        expect(await slot(page).evaluate((el) => getComputedStyle(el).position)).toBe('static') // never sticky
        expect(await overlaps(page)).toEqual([])
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
        expect(google).toEqual([])
      })
    }
  })
}

/** Sums every layout shift from the first frame on. */
const recordShifts = (page: Page) =>
  page.addInitScript(() => {
    const w = window as unknown as { shift: number }
    w.shift = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) w.shift += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })

for (const viewport of VIEWPORTS) {
  for (const path of ['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer']) {
    test(`${path} on a ${viewport.name}: the layout holds still for 3 s after load`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await recordShifts(page)
      await page.goto(path)
      await page.waitForTimeout(3000)
      await expect(slot(page)).toHaveCount(1)
      expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBeLessThan(0.01)
    })
  }
}

test('the trace page puts the slot under the Code column when wide and after the table on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await ready(page, '/trace-table')
  const code = page.getByRole('region', { name: 'Code' })
  const pane = page.getByRole('region', { name: 'Trace', exact: true })
  await expect(code.getByTestId('ad-slot')).toHaveCount(1)
  await expect(slot(page)).toHaveCount(1)

  await page.setViewportSize({ width: 375, height: 812 })
  await expect(code.getByTestId('ad-slot')).toHaveCount(0)
  await expect(slot(page)).toHaveCount(1)
  const paneBox = (await pane.boundingBox())!
  expect((await slot(page).boundingBox())!.y).toBeGreaterThanOrEqual(paneBox.y + paneBox.height)
})

for (const path of ['/privacy', '/no-such-page']) {
  test(`${path} has no slot`, async ({ page }) => {
    await ready(page, path)
    await expect(page.locator('footer')).toBeVisible()
    await expect(slot(page)).toHaveCount(0)
  })
}

test('each house card leads to another page, which gets its own', async ({ page }) => {
  await ready(page, '/truth-tables')
  await slot(page).getByRole('link').click()
  await expect(page).toHaveURL(/\/number-systems/)
  await expect(slot(page).getByRole('link')).toHaveAttribute('href', '/sorting-visualizer')
})

test('the slot is gone in each study, quiz and practice mode, and comes back after', async ({ page }) => {
  await ready(page, '/trace-table')
  const study = page.getByRole('button', { name: /^Study mode/ })
  await expect(slot(page)).toHaveCount(1)
  await study.click()
  await expect(page.locator('input[data-study-key]').first()).toBeVisible()
  await expect(slot(page)).toHaveCount(0)
  await study.click()
  await expect(slot(page).getByTestId('house-card')).toBeVisible()

  await ready(page, '/truth-tables')
  await study.click()
  await expect(slot(page)).toHaveCount(0)
  await study.click()
  await expect(slot(page)).toHaveCount(1)

  await ready(page, '/number-systems')
  await page.getByRole('radio', { name: 'Practice' }).click()
  await expect(page.getByTestId('question').first()).toBeVisible()
  await expect(slot(page)).toHaveCount(0)
  await page.getByRole('radio', { name: 'Addition' }).click()
  await expect(slot(page)).toHaveCount(1)

  await ready(page, '/sorting-visualizer?quiz=1')
  await expect(slot(page)).toHaveCount(0)
  await page.getByRole('radio', { name: 'Watch' }).click()
  await expect(slot(page).getByTestId('house-card')).toBeVisible()
})

test('the slot is gone in a challenge link, in projector mode and in print', async ({ page }) => {
  const hash = encodeShare(defaultWorkspace('x = 1\n'), { steps: 1, executionKey: 'any' })
  await page.goto(`/trace-table#s=${hash}`)
  await expect(page.getByRole('region', { name: 'Student challenge' })).toBeVisible()
  await expect(slot(page)).toHaveCount(0)
  await page.getByRole('button', { name: 'End challenge' }).click()
  await expect(slot(page).getByTestId('house-card')).toBeVisible()

  const projector = page.getByRole('button', { name: /^Projector/ })
  await projector.click()
  await expect(slot(page)).toHaveCount(0)
  await projector.click()
  await expect(slot(page)).toHaveCount(1)

  await page.goto('/about')
  await expect(slot(page)).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(slot(page)).toBeHidden()
})

test.describe('built with fake AdSense IDs', { tag: '@ads' }, () => {
  /** `loader`: the stand-in for Google's script, or null to block it as an ad blocker would. */
  async function serve(page: Page, baseURL: string, loader: string | null) {
    await page.route(
      (url) => url.origin !== new URL(baseURL).origin,
      (route) => route.abort(),
    )
    // registered last, so it wins over the block above
    await page.route('**/pagead2.googlesyndication.com/**', (route) =>
      loader === null
        ? route.abort()
        : route.fulfill({ contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: loader }),
    )
  }

  /** Counts pushes, and a moment later marks the unit the way AdSense does. */
  const stub = (status: 'filled' | 'unfilled') => `
    const queued = window.adsbygoogle || []
    window.pushes = 0
    window.personalised = 0
    const take = () => {
      window.pushes++
      // a request is only allowed with the non-personalised flag already set
      if (window.adsbygoogle.requestNonPersonalizedAds !== 1) window.personalised++
      const unit = document.querySelector('ins.adsbygoogle:not([data-adsbygoogle-status])')
      unit.setAttribute('data-adsbygoogle-status', 'done')
      setTimeout(() => unit.setAttribute('data-ad-status', '${status}'), 600)
    }
    window.adsbygoogle = { loaded: true, push: take, requestNonPersonalizedAds: queued.requestNonPersonalizedAds }
    queued.forEach(take)
  `
  const pushes = (page: Page) => page.evaluate(() => (window as unknown as { pushes: number }).pushes)

  /** Where the box and the section under it are. */
  const positions = async (page: Page) => ({
    box: await slot(page).boundingBox(),
    below: await page.getByRole('heading', { name: 'Quick starts' }).boundingBox(),
  })

  test('a filled unit stays, with one push per visit', async ({ page, baseURL }) => {
    const problems = await watchForProblems(page)
    await serve(page, baseURL!, stub('filled'))
    await page.goto('/')
    await expect(page.locator('ins.adsbygoogle[data-ad-status="filled"]')).toHaveCount(1)
    await expect(slot(page).getByText('Advertisement')).toBeVisible()
    expect((await slot(page).boundingBox())!.height).toBe(BOX_HEIGHT)
    expect(await pushes(page)).toBe(1)

    await page.getByRole('contentinfo').getByRole('link', { name: 'About' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
    await expect.poll(() => pushes(page)).toBe(2)
    await expect(page.locator('ins.adsbygoogle[data-ad-status="filled"]')).toHaveCount(1)
    expect(await page.evaluate(() => (window as unknown as { personalised: number }).personalised)).toBe(0)
    expect(problems).toEqual([]) // the real CSP lets the loader in
  })

  for (const [name, loader] of [
    ['an unfilled unit', stub('unfilled')],
    ['a blocked loader', null],
  ] as const) {
    test(`${name} swaps to the house card without moving anything`, async ({ page, baseURL }) => {
      await recordShifts(page)
      await serve(page, baseURL!, loader)
      await page.goto('/')
      await expect(slot(page)).toBeVisible()
      const before = await positions(page)
      await expect(slot(page).getByTestId('house-card')).toBeVisible({ timeout: 15_000 })
      await expect(page.locator('ins.adsbygoogle')).toHaveCount(0)
      expect(await positions(page)).toEqual(before)
      expect(await page.evaluate(() => (window as unknown as { shift: number }).shift)).toBeLessThan(0.01)
    })
  }
})
