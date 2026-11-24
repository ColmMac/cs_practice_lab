import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const ROUTES = [
  ['/', 'CS Study Hub', /revision tools/],
  ['/trace-table', 'Trace tables · CS Study Hub', /trace table/i],
  ['/truth-tables', 'Truth tables · CS Study Hub', /truth tables/i],
  ['/number-systems', 'Number systems · CS Study Hub', /two’s complement/],
  ['/sorting-visualizer', 'Sorting & searching · CS Study Hub', /binary search/],
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
  await expect(page).toHaveTitle('Truth tables · CS Study Hub')
  await expect(page.locator('head meta[name="description"]')).toHaveCount(1)

  await page.goto('/nope')
  await expect(page).toHaveTitle('Page not found · CS Study Hub')
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute('content', 'noindex')
})

test('index.html carries a default title and description for crawlers without JS', async ({ request }) => {
  const html = await (await request.get('/')).text()
  expect(html).toMatch(/<title>CS Study Hub<\/title>/)
  expect(html).toMatch(/<meta\s+data-default\s+name="description"\s+content="[^"]{40,}"/)
})

test('robots.txt allows crawling; there is no canonical link without VITE_SITE_URL', async ({ page, request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.ok()).toBe(true)
  expect(await robots.text()).toMatch(/User-agent: \*\s+Allow: \//)
  await page.goto('/')
  await expect(page.locator('head link[rel="canonical"]')).toHaveCount(0)
})
