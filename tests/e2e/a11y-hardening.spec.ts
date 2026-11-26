import { expect, test, type Locator, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const spoken = (page: Page) => page.getByTestId('live-region')
const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })

async function traceReady(page: Page) {
  await page.goto('/trace-table')
  await expect(traceTable(page)).toBeVisible({ timeout: 80_000 })
}

/** The longest transition on an element, in seconds. */
const transitionSeconds = (el: Locator) =>
  el.evaluate((e) => Math.max(...getComputedStyle(e).transitionDuration.split(',').map((d) => parseFloat(d))))

test.describe('prefers-reduced-motion on the sorting visualiser', () => {
  test('with motion allowed, cards slide', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto('/sorting-visualizer')
    expect(await transitionSeconds(page.getByTestId('card').first())).toBeGreaterThan(0.1)
  })

  test('with motion reduced, nothing slides, fades or smooth-scrolls, and playback waits to be started', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/sorting-visualizer')
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await page.waitForTimeout(1200)
    await expect(page.getByText(/^Step 0 of \d+$/)).toBeVisible()

    const slow = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .filter((e) => {
          const s = getComputedStyle(e)
          const longest = (v: string) => Math.max(...v.split(',').map((d) => parseFloat(d)))
          return longest(s.transitionDuration) > 0.001 || longest(s.animationDuration) > 0.001 || s.scrollBehavior === 'smooth'
        })
        .map((e) => e.outerHTML.slice(0, 80)),
    )
    expect(slow).toEqual([])

    await page.getByRole('button', { name: /^Step$/ }).click()
    await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible()
  })
})

test('each sorting card names its state, and each step is announced', async ({ page }) => {
  await page.goto('/sorting-visualizer')
  await expect(spoken(page)).toBeEmpty()
  await page.getByRole('button', { name: /^Step$/ }).click()
  await expect(page.getByRole('listitem', { name: 'index 0, value 5, Comparing' })).toBeVisible()
  await expect(spoken(page)).toContainText('Compare 5 and 1: 5 is bigger, so swap them.')
})

test('the trace page announces Python and the run, and its rows and tables are named', async ({ page }) => {
  await traceReady(page)
  await expect(spoken(page)).toContainText('Python ready')
  await expect(spoken(page)).toContainText(/Run finished: \d+ steps\./)
  await expect(traceTable(page).locator('caption')).toHaveText(/^Trace of the program/)
  const rows = await traceTable(page).locator('tbody tr').count()
  await expect(traceTable(page).getByRole('rowheader')).toHaveCount(rows)
  // a header cell, styled like the cells beside it
  const first = traceTable(page).locator('tbody th').first()
  await expect(first).toHaveCSS('text-align', 'left')
})

test('a long, windowed table still says how many rows it has', async ({ page }) => {
  await traceReady(page)
  await expect(page.getByRole('status').filter({ hasText: /^Python ready$/ })).toBeVisible()
  await page.locator('.cm-content').fill('total = 0\nfor i in range(300):\n    total = total + i\n')
  await page.getByRole('button', { name: 'Run', exact: true }).click()
  await expect(spoken(page)).toContainText(/Run finished: [3-9]\d\d steps\./)
  const count = Number(await traceTable(page).getAttribute('aria-rowcount'))
  expect(count).toBeGreaterThan(300)
  await expect(traceTable(page).locator('tbody tr[aria-rowindex]').first()).toHaveAttribute('aria-rowindex', /^\d+$/)
  expect(await traceTable(page).locator('tbody tr[aria-rowindex]').count()).toBeLessThan(count - 1)
})

test('a truth table, a conversion and a score are each announced', async ({ page }) => {
  await page.goto('/truth-tables')
  await page.locator('#truth-expr').fill('A AND (B OR C)')
  await expect(spoken(page)).toContainText('Truth table built: 8 rows, 4 columns.')
  await page.getByRole('button', { name: /^Study mode/ }).click()
  await page.getByRole('button', { name: 'Check answers' }).click()
  await expect(spoken(page)).toContainText('Score: 0 / 8 · 0%')
  const verdict = page.locator('[id^="study-msg-"]').first()
  await expect(verdict).toContainText('Not correct')
  await expect(verdict.locator('svg.lucide-x')).toHaveAttribute('aria-hidden', 'true')
  await expect(verdict.locator('svg.lucide-x')).toBeVisible()

  await page.goto('/number-systems')
  await page.getByLabel(/^Hex/).fill('2A')
  await expect(spoken(page)).toContainText('32 + 8 + 2 = 42')
})

test('a carry out and a signed overflow are marked in words', async ({ page }) => {
  await page.goto('/number-systems?mode=add')
  await page.getByRole('button', { name: 'Carry out' }).click()
  await expect(page.getByTestId('carry-out').getByText('Carry', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Signed overflow' }).click()
  await expect(page.getByTestId('result-bit').first().getByText('Overflow', { exact: true })).toBeVisible()
})

test.describe('focus is always visible', () => {
  /** The ring of whatever has focus: its own, or CodeMirror's around the whole editor. */
  const ring = (page: Page) =>
    page.evaluate(() => {
      const active = document.activeElement as HTMLElement
      const el = active.closest('.cm-editor') ?? active
      const s = getComputedStyle(el)
      return { tag: el.tagName, style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
    })

  const hasRing = (r: { style: string; width: number }) => r.style !== 'none' && r.width >= 2

  for (const scheme of ['light', 'dark'] as const) {
    test(`every tab stop on the trace page has a 2px ring (${scheme})`, async ({ page }) => {
      await page.addInitScript((theme) => localStorage.setItem('tts:theme', theme), scheme)
      await traceReady(page)
      const missing: string[] = []
      for (let i = 0; i < 30; i++) {
        await page.keyboard.press('Tab')
        // CodeMirror marks itself focused from a timer, so its ring can land just after the focus does.
        let r = await ring(page)
        for (let waited = 0; waited < 1000 && !hasRing(r); waited += 50) {
          await page.waitForTimeout(50)
          r = await ring(page)
        }
        if (!hasRing(r)) missing.push(`${i}: ${r.tag} ${r.style} ${r.width}`)
      }
      expect(missing).toEqual([])
    })
  }

  test('the code editor draws its ring round the whole editor', async ({ page }) => {
    await traceReady(page)
    await page.locator('.cm-content').focus()
    await expect(page.locator('.cm-editor')).toHaveCSS('outline-style', 'solid')
    await expect(page.locator('.cm-editor')).toHaveCSS('outline-width', '2px')
  })

  test('the skip link’s target shows where focus went', async ({ page }) => {
    await page.goto('/about')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await expect(page.locator('#main')).toBeFocused()
    await expect(page.locator('#main')).toHaveCSS('outline-style', 'solid')
  })
})
