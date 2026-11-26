import { expect, test } from '@playwright/test'
import { watchForProblems } from './pageProblems'

/**
 * The hosting config as `vite preview` serves it: the `/*` headers from public/_headers on the production build.
 * The per-path cache rules are applied by the host only, so tests/unit/deploy.test.ts covers those.
 */

const ROUTES = ['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer', '/about', '/privacy', '/accessibility']

test('pages are served with the ad-compatible security headers', async ({ request }) => {
  for (const path of ROUTES) {
    const headers = (await request.get(path)).headers()
    expect(headers['cross-origin-embedder-policy'], path).toBeUndefined()
    expect(headers['cross-origin-opener-policy'], path).toBe('same-origin-allow-popups')
    expect(headers['referrer-policy'], path).toBe('strict-origin-when-cross-origin')
    expect(headers['x-content-type-options'], path).toBe('nosniff')
    expect(headers['x-frame-options'], path).toBe('DENY')
    expect(headers['content-security-policy'], path).toContain("frame-ancestors 'none'")
    expect(headers['content-security-policy'], path).not.toContain("'unsafe-eval'")
  }
})

test('an unknown path still reaches the app’s own 404', async ({ page }) => {
  await page.goto('/no/such/page')
  await expect(page).toHaveTitle('Page not found · CS Practice Lab')
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})

test('Python runs without cross-origin isolation, and a runaway program is still stopped', async ({ page }) => {
  const problems = await watchForProblems(page)
  await page.goto('/trace-table')
  const ready = page.getByRole('status').filter({ hasText: /^Python ready$/ })
  await expect(ready).toBeVisible({ timeout: 80_000 })
  expect(await page.evaluate(() => window.crossOriginIsolated)).toBe(false)

  const editor = page.locator('.cm-content').first()
  await editor.fill('while True: pass')
  await page.keyboard.press('Control+Enter')
  await expect(page.getByText(/step limit|time limit|too long|stopped/i).first()).toBeVisible()

  await editor.fill('total = 40 + 2')
  await page.waitForTimeout(1000) // Run has a one-second cooldown
  await page.keyboard.press('Control+Enter')
  await expect(page.getByRole('table', { name: 'Trace table' }).getByRole('cell', { name: '42' })).toBeVisible()
  expect(problems).toEqual([])
})

/**
 * The widened policy, tried for real. Every outside request is answered here, so no test traffic reaches Google;
 * the policy is checked by the browser before a request leaves the page.
 */
test('the CSP lets ad scripts, frames, images and requests through, and still blocks other hosts', async ({ page }) => {
  await page.route(/^https:\/\/(?!cdn\.jsdelivr\.net)/, (route) => {
    const type = route.request().resourceType()
    if (type === 'script') return route.fulfill({ contentType: 'text/javascript', body: 'window.__stubAd = true' })
    // no Cross-Origin-Resource-Policy header: the old `require-corp` would have blocked this frame
    if (type === 'document') return route.fulfill({ contentType: 'text/html', body: '<p>stub frame</p>' })
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, body: '' })
  })
  await page.goto('/about')

  const violations = await page.evaluate(async () => {
    const seen: string[] = []
    document.addEventListener('securitypolicyviolation', (e) =>
      seen.push(`${e.effectiveDirective} ${new URL(e.blockedURI).hostname}`),
    )
    const add = (tag: 'script' | 'iframe' | 'img', src: string) =>
      new Promise<void>((done) => {
        const element = document.createElement(tag)
        element.onload = () => done()
        element.onerror = () => done()
        element.src = src
        if (tag === 'iframe') element.title = src
        document.body.append(element)
        setTimeout(done, 3000)
      })
    await add('script', 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')
    await add('script', 'https://fundingchoicesmessages.google.com/i/pub-0')
    await add('iframe', 'https://googleads.g.doubleclick.net/pagead/ads')
    await add('img', 'https://images.example/pixel.gif')
    await fetch('https://ep1.adtrafficquality.google/ping')
    await fetch('https://fundingchoicesmessages.google.com/f/ping')
    // not on the list
    await add('script', 'https://scripts.example/tracker.js')
    await add('iframe', 'https://frames.example/')
    await fetch('https://collect.example/ping').catch(() => {})
    await new Promise((done) => setTimeout(done, 250))
    return seen.sort()
  })

  expect(violations).toEqual(['connect-src collect.example', 'frame-src frames.example', 'script-src-elem scripts.example'])
  expect(await page.evaluate(() => (window as unknown as { __stubAd?: boolean }).__stubAd)).toBe(true)
  const adFrame = page.frameLocator('iframe[title^="https://googleads"]')
  await expect(adFrame.getByText('stub frame')).toBeVisible()
})
