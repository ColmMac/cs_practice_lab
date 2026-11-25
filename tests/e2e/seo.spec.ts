import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const ROUTES = [
  ['/', 'CS Practice Lab', /revision tools/],
  ['/trace-table', 'Trace tables · CS Practice Lab', /trace table/i],
  ['/truth-tables', 'Truth tables · CS Practice Lab', /truth tables/i],
  ['/number-systems', 'Number systems · CS Practice Lab', /two’s complement/],
  ['/sorting-visualizer', 'Sorting & searching · CS Practice Lab', /binary search/],
] as const

for (const [path, title, description] of ROUTES) {
  test(`${path} has its own title and description`, async ({ page }) => {
    await page.goto(path)
    await expect(page).toHaveTitle(title)
    await expect(page.locator('head meta[name="description"]')).toHaveCount(1)
    await expect(page.locator('head meta[name="description"]')).toHaveAttribute('content', description)
  })
}

test('the title and description follow client-side navigation, and the 404 is noindex', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Truth tables' }).click()
  await expect(page).toHaveTitle('Truth tables · CS Practice Lab')
  await expect(page.locator('head meta[name="description"]')).toHaveCount(1)

  await page.goto('/nope')
  await expect(page).toHaveTitle('Page not found · CS Practice Lab')
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})

test('index.html carries a default title and description for crawlers without JS', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toMatch(/<title>CS Practice Lab<\/title>/)
  expect(html).toMatch(/<meta\s+data-default\s+name="description"\s+content="[^"]{40,}"/)
})

test('robots.txt allows crawling', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toMatch(/User-agent: \*\s+Allow: \//)
})

// The E2E build has no VITE_SITE_URL, so these are the defaults from src/config/site.ts.
test('every route has a canonical link on the production origin, and the 404 has none', async ({ page }) => {
  const canonical = page.locator('head link[rel="canonical"]')
  for (const [path] of ROUTES) {
    await page.goto(path)
    await expect(canonical).toHaveCount(1)
    await expect(canonical).toHaveAttribute('href', `https://cspracticelab.com${path}`)
  }
  await page.goto('/truth-tables/?x=1')
  await expect(canonical).toHaveAttribute('href', 'https://cspracticelab.com/truth-tables')
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Number systems' }).click()
  await expect(page).toHaveURL(/number-systems/)
  await expect(canonical).toHaveCount(1)
  await expect(canonical).toHaveAttribute('href', 'https://cspracticelab.com/number-systems')

  await page.goto('/nope')
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(canonical).toHaveCount(0)
})

test('the head basics: British English, theme colours and real icon files', async ({ page, request }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB')
  await expect(page.locator('head meta[name="theme-color"]')).toHaveCount(2)
  await expect(page.locator('head link[rel="icon"]')).toHaveCount(2)
  await expect(page.locator('head link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/apple-touch-icon.png')

  // A missing file would fall through the SPA rule as index.html with a 200, so the type is what counts.
  const files = [
    ['/favicon.svg', /^image\/svg\+xml/],
    ['/favicon.ico', /^image\/(x-icon|vnd\.microsoft\.icon)/],
    ['/apple-touch-icon.png', /^image\/png/],
    ['/og-image.png', /^image\/png/],
  ] as const
  for (const [path, type] of files) {
    const res = await request.get(path)
    expect(res.headers()['content-type'], path).toMatch(type)
  }
  for (const [path, width, height] of [['/apple-touch-icon.png', 180, 180], ['/og-image.png', 1200, 630]] as const) {
    const png = await (await request.get(path)).body()
    expect([png.readUInt32BE(16), png.readUInt32BE(20)], path).toEqual([width, height])
  }
})

test('the build ships no AdSense script', async ({ page }) => {
  const adRequests: string[] = []
  page.on('request', (r) => /googlesyndication|doubleclick/.test(r.url()) && adRequests.push(r.url()))
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  expect(await page.content()).not.toMatch(/googlesyndication|adsbygoogle/)
  expect(adRequests).toEqual([])
})
