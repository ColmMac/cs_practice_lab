import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { parseChunk, type Budget } from '../../scripts/check-bundle.mjs'

// `npm run check:bundle` weighs files by name. These tests check, in a real browser, that those names are the files
// each page really downloads, so that a budget can't pass by counting the wrong ones.
const budget = JSON.parse(readFileSync('bundle-budget.json', 'utf8')) as Budget
const firstLoad = budget.groups.find((g) => g.firstLoad)!.chunks

async function downloads(page: Page, path: string, ready: () => Promise<void>) {
  const chunks: { name: string; type: string }[] = []
  page.on('request', (r) => {
    const chunk = parseChunk(new URL(r.url()).pathname.replace(/^\/assets\//, ''))
    if (chunk) chunks.push(chunk)
  })
  await page.goto(path)
  await ready()
  await page.waitForLoadState('networkidle')
  const names = (type: string) => [...new Set(chunks.filter((c) => c.type === type).map((c) => c.name))].sort()
  return { js: names('js'), css: names('css') }
}

test('the home page downloads exactly the first-load group and the budgeted stylesheet', async ({ page }) => {
  const got = await downloads(page, '/', () => expect(page.getByRole('list', { name: 'Tools' })).toBeVisible())
  expect(got.js).toEqual([...firstLoad].sort())
  expect(got.css).toEqual(budget.groups.filter((g) => g.type === 'css').flatMap((g) => g.chunks))
})

for (const [path, own] of [
  ['/trace-table', ['TraceTableRoute', 'codemirror']],
  ['/truth-tables', ['TruthTablePage']],
  ['/number-systems', ['NumberSystemsPage']],
  ['/sorting-visualizer', ['SortingPage']],
] as const) {
  test(`${path} downloads the chunks its budgets count`, async ({ page }) => {
    const got = await downloads(page, path, () => expect(page.getByRole('main').first()).toBeVisible())
    const budgeted = budget.groups.filter((g) => g.type === 'js' && !g.firstLoad).flatMap((g) => g.chunks)
    expect(got.js.filter((name) => budgeted.includes(name))).toEqual([...own].sort())
    expect(got.js).toEqual(expect.arrayContaining(firstLoad))
  })
}
