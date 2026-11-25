import { expect, test, type Locator, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

/** Glyphs that were button decoration. The state and verdict marks (✓ ≈ ✗ ⇄ ◆ ★ …) are meaning, and stay. */
const DECORATION = /[\u{1F000}-\u{1FAFF}⇪⇩☀☾✕▾▸◀]/u

const ROUTES = ['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer', '/about', '/privacy'] as const

async function ready(page: Page, path: string) {
  await page.goto(path)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  if (path === '/trace-table') await expect(page.getByRole('table', { name: 'Trace table' })).toBeVisible({ timeout: 80_000 })
}

const css = (el: Locator, prop: string) => el.evaluate((e, p) => getComputedStyle(e).getPropertyValue(p), prop)

/** A lucide icon beside the label: drawn, and hidden from assistive technology. */
async function expectIcon(control: Locator, icon: string) {
  const svg = control.locator(`svg.lucide-${icon}`)
  await expect(svg).toHaveAttribute('aria-hidden', 'true')
  await expect(svg).toBeVisible()
}

test('home: the plain headline, and all four tool cards above the fold at 1280×800', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 2, name: 'Practice tools for school and university computer science' })).toBeVisible()
  await expect(page.getByText(/just work/i)).toHaveCount(0)
  const cards = page.getByRole('list', { name: 'Tools' }).locator('> li')
  await expect(cards).toHaveCount(4)
  for (let i = 0; i < 4; i++) {
    const card = cards.nth(i)
    await expect(card).toBeInViewport({ ratio: 1 })
    await expect(card.locator('svg.lucide')).toHaveCount(1)
    // a summary, badges and a link: the three-bullet lists are gone
    await expect(card.getByRole('list')).toHaveCount(1)
  }
  // the cards come before the quick starts and the progress panel
  const top = async (l: Locator) => (await l.boundingBox())!.y
  const cardsTop = await top(page.getByRole('list', { name: 'Tools' }))
  expect(await top(page.getByRole('heading', { name: 'Quick starts' }))).toBeGreaterThan(cardsTop)
  expect(await top(page.getByRole('heading', { name: 'Your progress' }))).toBeGreaterThan(cardsTop)
})

test('no route has a decorative glyph left in a button or a link', async ({ page }) => {
  for (const path of ROUTES) {
    await ready(page, path)
    const labels = await page.locator('button, a').allTextContents()
    expect(labels.filter((t) => DECORATION.test(t)), path).toEqual([])
  }
})

test('toolbar buttons keep their text label and gain a hidden icon', async ({ page }) => {
  await ready(page, '/trace-table')
  for (const [name, icon] of [
    ['Run', 'play'],
    ['Study mode', 'pencil-line'],
    ['Projector', 'presentation'],
    ['Export', 'download'],
    ['Share', 'share-2'],
    ['Copy student challenge link', 'graduation-cap'],
  ] as const) {
    await expectIcon(page.getByRole('button', { name, exact: true }), icon)
  }
  await expect(page.getByRole('button', { name: /^Switch to (light|dark) mode$/ }).locator('svg[aria-hidden="true"]')).toBeVisible()
  await expectIcon(page.getByRole('button', { name: /^Columns/ }), 'chevron-down')

  await ready(page, '/sorting-visualizer')
  await expectIcon(page.getByRole('button', { name: 'Step', exact: true }), 'chevron-right')
  await expectIcon(page.getByRole('button', { name: 'Step back' }), 'chevron-left')
})

test('colour tokens drive the shell and switch with the theme', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:theme', 'light'))
  await page.goto('/')
  const body = page.locator('#main').locator('..')
  const header = page.locator('header')
  const link = page.getByRole('link', { name: 'Open Trace tables' })
  const read = async () => [await css(body, 'background-color'), await css(header, 'background-color'), await css(link, 'color')]
  const light = await read()
  expect(light.every((c) => c && c !== 'rgba(0, 0, 0, 0)')).toBe(true)
  await page.getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect.poll(async () => (await read()).every((c, i) => c !== light[i])).toBe(true)
})

test('only floating layers have a shadow', async ({ page }) => {
  await ready(page, '/trace-table')
  const shadowed = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('body *')]
        // Tailwind's ring variables compute to transparent zero shadows: only a painted one counts
        .filter((e) => !e.closest('.cm-editor') && /rgba?\((?!0, 0, 0, 0\))|oklab|oklch/.test(getComputedStyle(e).boxShadow))
        .map((e) => e.getAttribute('role') ?? e.tagName),
    )
  expect(await shadowed()).toEqual([])
  await page.getByRole('button', { name: 'Export', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Export' })).toBeVisible()
  expect(await shadowed()).toEqual(['dialog'])
})

test('numbers that line up use tabular numerals', async ({ page }) => {
  const tabular = async (l: Locator) => expect(await css(l.first(), 'font-variant-numeric')).toContain('tabular-nums')

  await page.goto('/')
  await tabular(page.getByText(/trace presets mastered$/))
  await ready(page, '/trace-table')
  await tabular(page.getByRole('table', { name: 'Trace table' }).locator('tbody td'))
  await ready(page, '/truth-tables')
  await tabular(page.getByRole('table', { name: 'Truth table' }).locator('tbody td'))
  await ready(page, '/number-systems')
  await tabular(page.getByRole('group', { name: /bit register/ }).locator('button'))
  await ready(page, '/sorting-visualizer')
  await tabular(page.getByTestId('card').locator('span'))
  await tabular(page.getByText(/^Step \d+ of \d+$/))
})

test.describe('axe on the real page', () => {
  test.use({ bypassCSP: true }) // lets the test inject axe-core; the CSP itself is tested elsewhere

  async function violations(page: Page) {
    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
    return page.evaluate(async () => {
      const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
      return (await axe.run()).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
    })
  }

  for (const theme of ['light', 'dark'] as const) {
    test.describe(theme, () => {
      test.beforeEach(async ({ page }) => {
        await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
      })

      test('routes, popovers included', async ({ page }) => {
        for (const path of ROUTES) {
          await ready(page, path)
          expect(await violations(page), path).toEqual([])
        }
        await ready(page, '/trace-table')
        await page.getByRole('button', { name: 'Export', exact: true }).click()
        expect(await violations(page), 'export popover').toEqual([])
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: /^Columns/ }).click()
        expect(await violations(page), 'columns popover').toEqual([])
      })

      test('trace Study mode, with marked, hinted and revealed cells', async ({ page }) => {
        await ready(page, '/trace-table')
        await page.getByRole('button', { name: 'Study mode', exact: true }).click()
        const boxes = page.locator('input[data-study-key]')
        await boxes.first().fill('999')
        await page.getByRole('button', { name: /^Hint for / }).nth(1).click()
        await page.getByRole('button', { name: /^Reveal / }).nth(2).click()
        await page.getByRole('button', { name: 'Check answers' }).click()
        await expect(page.getByRole('region', { name: 'Score' })).toContainText('1 revealed (not scored)')
        expect(await violations(page)).toEqual([])
      })

      test('truth-table Study mode and the sorting quiz', async ({ page }) => {
        await ready(page, '/truth-tables')
        await page.getByRole('button', { name: 'Study mode', exact: true }).click()
        await expect(page.getByRole('region', { name: 'Study mode' })).toBeVisible()
        expect(await violations(page), 'truth study').toEqual([])
        await page.goto('/sorting-visualizer?algo=bubble&quiz=1')
        await expect(page.getByTestId('quiz-prompt')).toBeVisible()
        expect(await violations(page), 'sorting quiz').toEqual([])
      })

      // At 1280 wide nothing overflows sideways, so rules about scrolling regions only bite on narrower screens
      for (const [width, height] of [[1024, 768], [375, 812]] as const) {
        test(`routes and every Study mode at ${width}×${height}`, async ({ page }) => {
          await page.setViewportSize({ width, height })
          for (const path of ROUTES) {
            await ready(page, path)
            expect.soft(await violations(page), path).toEqual([])
          }

          await ready(page, '/trace-table?preset=bubble-sort')
          const overflow = await page.locator('.cm-scroller').evaluate((e) => e.scrollWidth - e.clientWidth)
          expect(overflow, 'the editor must scroll sideways, or this audit proves nothing about it').toBeGreaterThan(0)
          await expect(page.getByRole('textbox', { name: 'Code editor' })).toHaveAttribute('tabindex', '0')
          await page.getByRole('button', { name: 'Study mode', exact: true }).click()
          await expect(page.locator('input[data-study-key]').first()).toBeVisible()
          expect.soft(await violations(page), 'trace study').toEqual([])

          await ready(page, '/truth-tables')
          await page.getByRole('button', { name: 'Study mode', exact: true }).click()
          await expect(page.getByRole('region', { name: 'Study mode' })).toBeVisible()
          expect.soft(await violations(page), 'truth study').toEqual([])

          await page.goto('/number-systems?mode=practice')
          await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
          expect.soft(await violations(page), 'number practice').toEqual([])

          await page.goto('/sorting-visualizer?algo=bubble&quiz=1')
          await expect(page.getByTestId('quiz-prompt')).toBeVisible()
          expect.soft(await violations(page), 'sorting quiz').toEqual([])
        })
      }

      test('number practice and every sorting card state colour', async ({ page }) => {
        await page.goto('/number-systems?mode=practice')
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        expect(await violations(page), 'number practice').toEqual([])
        for (const algo of ['bubble', 'insertion', 'merge', 'binary&data=3,9,10,23,27,38,43,82&target=23']) {
          await page.goto(`/sorting-visualizer?algo=${algo}`)
          const step = page.getByRole('button', { name: 'Step', exact: true })
          await expect(step).toBeEnabled()
          for (let i = 0; i < 4 && (await step.isEnabled()); i++) await step.click()
          await page.waitForTimeout(350) // the cards slide
          expect(await violations(page), algo).toEqual([])
        }
      })
    })
  }
})
