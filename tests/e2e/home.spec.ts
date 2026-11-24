import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('home page: hero, CTA and a card per tool with curriculum badges', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'CS Study Hub' })).toBeVisible()
  await expect(page.getByText(/No login, nothing to install/)).toBeVisible()
  const cards = page.getByRole('list', { name: 'Tools' }).locator('> li')
  await expect(cards).toHaveCount(4)
  await expect(cards.first().getByRole('list', { name: 'Curriculum' }).getByText('SQA Higher')).toBeVisible()
  await page.getByRole('main').getByRole('link', { name: 'Start with a trace table' }).click()
  await expect(page).toHaveURL(/\/trace-table$/)
})

test('each card opens its tool', async ({ page }) => {
  for (const [name, path] of [
    ['Trace tables', '/trace-table'],
    ['Truth tables', '/truth-tables'],
    ['Number systems', '/number-systems'],
    ['Sorting & searching', '/sorting-visualizer'],
  ] as const) {
    await page.goto('/')
    await page.getByRole('main').getByRole('link', { name: `Open ${name}` }).click()
    await expect(page).toHaveURL(new RegExp(`${path}$`))
  }
})

test('the home page never loads CodeMirror or Pyodide', async ({ page }) => {
  const urls: string[] = []
  page.on('request', (r) => urls.push(r.url()))
  await page.goto('/')
  await expect(page.getByRole('list', { name: 'Tools' })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(urls.filter((u) => /pyodide|codemirror|worker|\.whl|python_stdlib/i.test(u))).toEqual([])
})

test.describe('axe audit on the real page', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  for (const theme of ['light', 'dark'] as const) {
    test(`no axe violations in ${theme} mode`, async ({ page }) => {
      await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
      await page.goto('/')
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
      await expect(page.getByRole('list', { name: 'Tools' })).toBeVisible()
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
      const results = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
        const r = await axe.run()
        return r.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
      })
      expect(results, theme).toEqual([])
    })
  }
})

test('one column at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  const boxes = await page.getByRole('list', { name: 'Tools' }).locator('> li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().x))
  expect(new Set(boxes).size).toBe(1)
})
