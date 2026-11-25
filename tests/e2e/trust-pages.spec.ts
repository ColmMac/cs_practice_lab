import { expect, test, type Page } from '@playwright/test'

const nav = (page: Page) => page.getByRole('navigation', { name: 'Tools' })

/** Console errors and CSP violations, collected from the moment the page starts loading. */
async function watchForProblems(page: Page): Promise<string[]> {
  const problems: string[] = []
  page.on('console', (m) => m.type() === 'error' && problems.push(m.text()))
  page.on('pageerror', (e) => problems.push(e.message))
  await page.exposeFunction('reportViolation', (v: string) => problems.push(v))
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      void (window as unknown as { reportViolation: (v: string) => void }).reportViolation(
        `CSP ${e.violatedDirective} ${e.blockedURI}`,
      )
    })
  })
  return problems
}

test('/about says what the site is, links every tool and gives the contact address', async ({ page }) => {
  await page.goto('/about')
  const main = page.getByRole('main')
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
  await expect(main.getByRole('heading', { level: 2 })).toHaveText([
    'Who it’s for',
    'The tools',
    'How it works',
    'Contact',
    'Source code',
  ])
  for (const [name, path] of [
    ['Trace tables', '/trace-table'],
    ['Truth tables', '/truth-tables'],
    ['Number systems', '/number-systems'],
    ['Sorting & searching', '/sorting-visualizer'],
  ] as const) {
    await expect(main.getByRole('link', { name, exact: true })).toHaveAttribute('href', path)
  }
  await expect(main.getByRole('link', { name: 'contact@cspracticelab.com' })).toHaveAttribute(
    'href',
    'mailto:contact@cspracticelab.com',
  )
  await expect(main.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/ColmMac/cs_practice_lab')
  // the nav stays four tools
  await expect(nav(page).getByRole('listitem')).toHaveCount(4)

  await main.getByRole('link', { name: 'privacy page' }).click()
  await expect(page).toHaveURL(/\/privacy$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
})

test('/privacy covers storage, third parties, adverts, rights and complaints', async ({ page }) => {
  await page.goto('/privacy')
  const main = page.getByRole('main')
  for (const key of ['tts:v1', 'tts:theme', 'tts:welcomed', 'tts:projector', 'tts:pseudo-dialect', 'hub:mastery:v1', 'hub:truth:last']) {
    await expect(main.getByText(`${key}:`)).toBeVisible()
  }
  for (const text of [/jsDelivr receives your IP address/, /Cloudflare hosts the site/, /non-personalised adverts only/, /We run no analytics/]) {
    await expect(main.getByText(text)).toBeVisible()
  }
  // this build has no AdSense publisher ID, and the page says so
  await expect(main.getByText(/Adverts are not switched on yet/)).toBeVisible()
  for (const [name, href] of [
    ['How Google uses information from sites that use our services', 'https://policies.google.com/technologies/partner-sites'],
    ['Google Ads Settings', 'https://adssettings.google.com'],
    ['YourAdChoices', 'https://youradchoices.com'],
    ['Your Online Choices', 'https://www.youronlinechoices.com'],
    ['Information Commissioner’s Office (ICO)', 'https://ico.org.uk/make-a-complaint/'],
  ] as const) {
    await expect(main.getByRole('link', { name })).toHaveAttribute('href', href)
  }
  await expect(main.locator('time')).toHaveText(/^\d{1,2} \w+ \d{4}$/)
})

test('the storage keys the app really writes are all on the privacy page', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Switch to (dark|light) mode/ }).click()
  await nav(page).getByRole('link', { name: 'Truth tables' }).click()
  await expect(page.getByRole('table').first()).toBeVisible()
  await nav(page).getByRole('link', { name: 'Trace tables' }).click()
  await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 80_000 })
  const keys = await page.evaluate(() => Object.keys(localStorage))
  expect(keys).toEqual(expect.arrayContaining(['tts:theme', 'hub:truth:last']))
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click()
  for (const key of keys) await expect(page.getByRole('main').getByText(`${key}:`)).toBeVisible()
})

test('"Manage cookie choices" is hidden without Google’s consent tool', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Manage cookie choices' })).toHaveCount(0)
})

/**
 * Google's consent tool as it arrives, some time after the page: it keeps what the page already put on `googlefc`,
 * runs the queued entries and then runs each new one as it is pushed. No Google traffic.
 */
function startConsentTool() {
  type Entry = (() => void) | { CONSENT_API_READY?: () => void }
  const w = window as unknown as {
    googlefc?: { callbackQueue?: unknown; showRevocationMessage?: () => void }
    reopened: number
  }
  w.reopened = 0
  const fc = (w.googlefc ??= {})
  const queued = (fc.callbackQueue ?? []) as Entry[]
  const run = (entry: Entry) => (typeof entry === 'function' ? entry() : entry.CONSENT_API_READY?.())
  fc.showRevocationMessage = () => w.reopened++
  fc.callbackQueue = { push: run }
  queued.forEach(run)
}
const reopened = (page: Page) => page.evaluate(() => (window as unknown as { reopened: number }).reopened)
const cookieButton = (page: Page) => page.getByRole('button', { name: 'Manage cookie choices' })

test('"Manage cookie choices" appears once the consent tool loads, however late, and reopens its message', async ({ page }) => {
  await page.clock.install()
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  // a slow connection: the page doesn't give up on the tool
  await page.clock.fastForward('01:00')
  await expect(cookieButton(page)).toHaveCount(0)
  await page.evaluate(startConsentTool)
  await cookieButton(page).click()
  expect(await reopened(page)).toBe(1)
})

test('"Manage cookie choices" is there straight away on a later visit to the page', async ({ page }) => {
  await page.goto('/privacy')
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  await page.evaluate(startConsentTool)
  await expect(cookieButton(page)).toBeVisible()
  await page.getByRole('contentinfo').getByRole('link', { name: 'About' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
  await page.getByRole('contentinfo').getByRole('link', { name: 'Privacy' }).click()
  await cookieButton(page).click()
  expect(await reopened(page)).toBe(1)
})

for (const path of ['/', '/about', '/privacy', '/truth-tables'] as const) {
  test(`${path}: no console errors or CSP violations, structured data included`, async ({ page }) => {
    const problems = await watchForProblems(page)
    const response = await page.goto(path)
    expect(response!.headers()['content-security-policy']).toContain("script-src 'self'")
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await expect(page.locator('script[type="application/ld+json"]').first()).toBeAttached()
    expect(problems).toEqual([])
  })
}

test('the new pages don’t scroll sideways on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  for (const path of ['/about', '/privacy']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path).toBeLessThanOrEqual(0)
  }
})
