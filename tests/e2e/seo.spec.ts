import { expect, test, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const ROUTES = [
  ['/', 'CS Practice Lab', /revision tools/],
  ['/trace-table', 'Trace tables · CS Practice Lab', /trace table/i],
  ['/truth-tables', 'Truth tables · CS Practice Lab', /truth tables/i],
  ['/number-systems', 'Number systems · CS Practice Lab', /two’s complement/],
  ['/sorting-visualizer', 'Sorting & searching · CS Practice Lab', /binary search/],
  ['/about', 'About · CS Practice Lab', /who it is for/],
  ['/privacy', 'Privacy · CS Practice Lab', /saves in your browser/],
  ['/accessibility', 'Accessibility · CS Practice Lab', /known limitations/],
] as const

const ORIGIN = 'https://cspracticelab.com'
const TOOL_PATHS: readonly string[] = ['/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer']

/** Everything in the document that describes it to a crawler, with how many of each there are. */
const headOf = (page: Page) =>
  page.evaluate(() => {
    const all = (selector: string, attr: string) =>
      [...document.querySelectorAll(selector)].map((el) => el.getAttribute(attr))
    return {
      canonical: all('link[rel="canonical"]', 'href'),
      description: all('meta[name="description"]', 'content'),
      ogUrl: all('meta[property="og:url"]', 'content'),
      ogTitle: all('meta[property="og:title"]', 'content'),
      ogImage: all('meta[property="og:image"]', 'content'),
      card: all('meta[name="twitter:card"]', 'content'),
      leftovers: document.querySelectorAll('[data-default]').length,
      jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(
        (s) => JSON.parse(s.textContent!) as Record<string, unknown>,
      ),
    }
  })

test('every route has a title of its own', () => {
  expect(new Set(ROUTES.map(([, title]) => title)).size).toBe(ROUTES.length)
})

/** The questions and answers a visitor can read in the guide's FAQ. */
const visibleFaq = (page: Page) =>
  page
    .getByRole('heading', { level: 4 })
    .evaluateAll((hs) => hs.map((h) => [h.textContent!, h.nextElementSibling!.textContent!]))

for (const [path, title, description] of ROUTES) {
  test(`${path}: after JavaScript there is exactly one of each head tag`, async ({ page }) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page).toHaveTitle(title)
    const head = await headOf(page)
    const url = `${ORIGIN}${path}`
    expect(head.canonical).toEqual([url])
    expect(head.ogUrl).toEqual([url])
    expect(head.ogTitle).toEqual([title])
    expect(head.ogImage).toEqual([`${ORIGIN}/og-image.png`])
    expect(head.card).toEqual(['summary_large_image'])
    expect(head.description).toEqual([expect.stringMatching(description)])
    expect(head.leftovers).toBe(0)
    expect(head.jsonLd.map((b) => b['@type'])).toEqual(
      TOOL_PATHS.includes(path) ? ['WebSite', 'WebApplication', 'FAQPage'] : ['WebSite'],
    )
    for (const block of head.jsonLd) {
      if (block['@type'] !== 'FAQPage') expect(String(block.url).startsWith(ORIGIN)).toBe(true)
      expect(String(block['@id']).startsWith(ORIGIN)).toBe(true)
    }
    const faq = head.jsonLd.find((b) => b['@type'] === 'FAQPage') as
      | { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
      | undefined
    if (faq) {
      const visible = await visibleFaq(page)
      expect(visible.length).toBeGreaterThanOrEqual(3)
      expect(faq.mainEntity.map((q) => [q.name, q.acceptedAnswer.text])).toEqual(visible)
    }
  })

  test(`${path}: the HTML as served, before any JavaScript, is already this page’s`, async ({ page, request }) => {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status()).toBe(200)
    const served = await response.text()
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const runtime = await headOf(page)

    const raw = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const all = (selector: string, attr: string) => [...doc.head.querySelectorAll(selector)].map((el) => el.getAttribute(attr))
      return {
        title: doc.title,
        canonical: all('link[rel="canonical"]', 'href'),
        description: all('meta[name="description"]', 'content'),
        jsonLd: [...doc.head.querySelectorAll('script[type="application/ld+json"]')].map(
          (s) => JSON.parse(s.textContent!) as Record<string, unknown>,
        ),
        noscript: /<noscript>\s*<h1>[^<]+<\/h1>/.test(html),
      }
    }, served)
    expect(raw).toEqual({
      title,
      canonical: runtime.canonical,
      description: runtime.description,
      jsonLd: runtime.jsonLd,
      noscript: true,
    })
  })
}

test('sitemap.xml lists all eight routes on the production origin', async ({ request }) => {
  const response = await request.get('/sitemap.xml')
  // a missing file would fall through to index.html with a 200, so the type is what counts
  expect(response.headers()['content-type']).toMatch(/xml/)
  const xml = await response.text()
  expect([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])).toEqual(ROUTES.map(([path]) => `${ORIGIN}${path}`))
  expect(xml.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)).toHaveLength(ROUTES.length)
})

// A missing file would fall through the SPA rule as index.html with a 200, so the type is what counts.
test('robots.txt allows crawling and names the sitemap', async ({ request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.headers()['content-type']).toMatch(/^text\/plain/)
  expect(await robots.text()).toBe('User-agent: *\nAllow: /\n\nSitemap: https://cspracticelab.com/sitemap.xml\n')
})

test('ads.txt is a text file, still holding the template line', async ({ request }) => {
  const ads = await request.get('/ads.txt')
  expect(ads.headers()['content-type']).toMatch(/^text\/plain/)
  expect(await ads.text()).toContain('# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0')
})

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false })

  test('the privacy page still has its text and links', async ({ page }) => {
    await page.goto('/privacy')
    await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 2, name: 'Adverts (Google AdSense)' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'About', exact: true })).toHaveAttribute('href', '/about')
  })
})

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

// The E2E build has no VITE_SITE_URL, so these are the defaults from src/config/site.ts.
test('the canonical drops queries and trailing slashes and follows navigation; the 404 has none', async ({ page }) => {
  const canonical = page.locator('head link[rel="canonical"]')
  await page.goto('/truth-tables/?x=1')
  await expect(canonical).toHaveAttribute('href', 'https://cspracticelab.com/truth-tables')
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Number systems' }).click()
  await expect(page).toHaveURL(/number-systems/)
  await expect(canonical).toHaveCount(1)
  await expect(canonical).toHaveAttribute('href', 'https://cspracticelab.com/number-systems')

  await page.goto('/nope')
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  await expect(canonical).toHaveCount(0)
  await expect(page.locator('meta[property^="og:"], script[type="application/ld+json"]')).toHaveCount(0)
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
