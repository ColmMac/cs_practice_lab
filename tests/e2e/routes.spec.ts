import { expect, test } from '@playwright/test'
import { watchForProblems } from './pageProblems'

/** The smoke test every published route has to pass, on the production build with the real headers. */
const ROUTES = ['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer', '/about', '/privacy', '/accessibility']

for (const path of ROUTES) {
  test(`${path}: loads cleanly, with one h1, one footer and nothing requested from Google`, async ({ page }) => {
    const problems = await watchForProblems(page)
    const google: string[] = []
    page.on('request', (r) => {
      if (/google|doubleclick|adtrafficquality/.test(new URL(r.url()).hostname)) google.push(r.url())
    })

    const response = await page.goto(path)
    expect(response!.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (path === '/trace-table') {
      await expect(page.getByRole('status').filter({ hasText: /^Python ready$/ })).toBeVisible({ timeout: 80_000 })
    }
    await page.waitForLoadState('networkidle')

    await expect(page.locator('h1')).toHaveCount(1)
    await expect(page.locator('footer')).toHaveCount(1)
    const footer = page.getByRole('contentinfo')
    await expect(footer.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
    expect(problems).toEqual([])
    expect(google).toEqual([])
  })
}
