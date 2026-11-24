import { expect, test } from '@playwright/test'
import { encodeShare } from '../../src/core/share/urlState'
import { defaultWorkspace } from '../../src/core/workspace'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('the nav reaches all four tools and the home page', async ({ page }) => {
  await page.goto('/')
  const nav = page.getByRole('navigation', { name: 'Tools' })
  await expect(page.getByRole('heading', { level: 1, name: 'CS Study Hub' })).toBeVisible()

  const tools = [
    ['Truth tables', '/truth-tables'],
    ['Number systems', '/number-systems'],
    ['Sorting & searching', '/sorting-visualizer'],
    ['Trace tables', '/trace-table'],
  ] as const
  for (const [name, path] of tools) {
    await nav.getByRole('link', { name }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(nav.getByRole('link', { name })).toHaveAttribute('aria-current', 'page')
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Trace Table Studio' })).toBeVisible()

  await nav.getByRole('link', { name: 'CS Study Hub' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('placeholder tools say coming soon and are noindex; unknown paths get a 404 page', async ({ page }) => {
  await page.goto('/truth-tables')
  await expect(page.getByText('Coming soon.')).toBeVisible()
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex')

  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Go to the home page' }).click()
  await expect(page).toHaveURL(/\/$/)
})

test('a deep link survives a reload', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await page.reload()
  await expect(page.getByRole('heading', { level: 1, name: 'Sorting & searching' })).toBeVisible()
})

test('a legacy /#s= share link lands on /trace-table in review and does not run', async ({ page }) => {
  const payload = encodeShare({ ...defaultWorkspace(), code: 'print("shared-secret-output")\n' })
  await page.goto(`/#s=${payload}`)
  await expect(page).toHaveURL(/\/trace-table#s=/)
  await expect(page.getByText(/shared/i).first()).toBeVisible()
  await expect(page.getByRole('button', { name: /▶ Run/ })).toBeVisible()
  // Never auto-runs: no table appears even after the runtime has had time to start.
  await page.waitForTimeout(3000)
  await expect(page.getByRole('table', { name: 'Trace table' })).toHaveCount(0)
})

test('the theme choice persists across routes', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Number systems' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByRole('navigation', { name: 'Tools' }).getByRole('link', { name: 'Trace tables' }).click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible()
})
