import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

test('home page: hero, CTA and a card per tool with curriculum badges', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'CS Practice Lab' })).toBeVisible()
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

for (const [name, path, heading] of [
  ['home', '/', 'CS Practice Lab'],
  ['about', '/about', /About/],
  ['privacy', '/privacy', /Privacy/],
] as const) {
  test(`the ${name} page never loads CodeMirror or Pyodide`, async ({ page }) => {
    const urls: string[] = []
    page.on('request', (r) => urls.push(r.url()))
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await page.waitForLoadState('networkidle')
    expect(urls.filter((u) => /pyodide|codemirror|worker|\.whl|python_stdlib/i.test(u))).toEqual([])
  })
}

// Without this, the tests above would pass just because no file was called "codemirror" any more.
test('the editor is its own chunk, which an app change does not rename', async ({ page, request }) => {
  const scripts: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('.js')) scripts.push(new URL(r.url()).pathname)
  })
  await page.goto('/trace-table')
  await expect(page.locator('.cm-content')).toBeVisible()
  const editor = scripts.filter((u) => /\/assets\/codemirror-[\w-]+\.js$/.test(u))
  expect(editor).toHaveLength(1)

  // A file's name changes whenever a file it imports is renamed, so the editor may import only stable vendor code.
  const source = await (await request.get(editor[0])).text()
  const imports = [...source.matchAll(/(?:from|import)\s*["']\.\/([^"']+)["']/g)].map((m) => m[1].replace(/-[\w-]{8}\.js$/, ''))
  expect(imports).toContain('react')
  expect(imports.filter((i) => i !== 'react' && i !== 'rolldown-runtime')).toEqual([])
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

test.describe('quick starts', () => {
  const strip = (page: import('@playwright/test').Page) => page.getByRole('list', { name: 'Quick starts' })
  const open = async (page: import('@playwright/test').Page, name: string) => {
    await page.goto('/')
    await strip(page).getByRole('link', { name }).click()
  }

  test('lists the five deep links', async ({ page }) => {
    await page.goto('/')
    await expect(strip(page).getByRole('link')).toHaveText([
      'Trace Bubble Sort in Python',
      'Half-Adder Truth Table',
      'Two’s Complement Overflow Check',
      'Binary Search for 23',
      'Bubble Sort: predict each pass',
    ])
  })

  test('Trace Bubble Sort loads and runs the built-in, then drops ?preset', async ({ page }) => {
    await open(page, 'Trace Bubble Sort in Python')
    await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 80_000 })
    await expect(page.locator('.cm-content')).toContainText('nums = [5, 2, 4, 1]')
    await expect(page).toHaveURL(/\/trace-table$/)
  })

  test('an unknown ?preset is ignored and removed', async ({ page }) => {
    await page.goto('/trace-table?preset=nope')
    await expect(page.locator('.cm-content')).toBeVisible()
    await expect(page).toHaveURL(/\/trace-table$/)
  })

  test('Half-Adder Truth Table opens the half adder', async ({ page }) => {
    await open(page, 'Half-Adder Truth Table')
    await expect(page).toHaveURL(/\/truth-tables\?preset=half-adder/)
    await expect(page.getByLabel('Example')).toHaveValue('half-adder')
  })

  test('Two’s Complement Overflow Check opens the addition with 127 + 1', async ({ page }) => {
    await open(page, 'Two’s Complement Overflow Check')
    await expect(page.getByTestId('addition-table')).toBeVisible()
    await expect(page.getByRole('textbox', { name: /^Operand A/ })).toHaveValue('01111111')
    await expect(page.getByRole('textbox', { name: /^Operand B/ })).toHaveValue('00000001')
    await expect(page.getByTestId('result-bit')).toHaveText(['1', '0', '0', '0', '0', '0', '0', '0'])
    await expect(page.getByText('Overflow: two positives gave a negative.')).toBeVisible()
  })

  test('Binary Search for 23 starts on the sorted list with target 23', async ({ page }) => {
    await open(page, 'Binary Search for 23')
    await expect(page.getByTestId('card')).toHaveCount(8)
    await expect(page.getByLabel(/^Algorithm/)).toHaveValue('binary')
    await expect(page.getByLabel(/^Target/)).toHaveValue('23')
  })

  test('Bubble Sort: predict each pass opens the quiz', async ({ page }) => {
    await open(page, 'Bubble Sort: predict each pass')
    await expect(page.getByRole('radio', { name: 'Quiz' })).toBeChecked()
  })

  test('a bad operand in the link is ignored', async ({ page }) => {
    await page.goto('/number-systems?mode=add&a=2&b=xyz')
    await expect(page.getByRole('textbox', { name: /^Operand A/ })).toHaveValue('00000000')
  })
})
