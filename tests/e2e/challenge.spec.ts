import { expect, test, type Browser, type Page } from '@playwright/test'
import { decodeShare, encodeShare, MAX_SHARE_PAYLOAD, parseShareHash } from '../../src/core/share/urlState'
import { defaultWorkspace } from '../../src/core/workspace'

const OWN_CODE = 'mine = "student-own-code"\nprint(mine)\n'

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const panel = (page: Page) => page.getByRole('region', { name: 'Student challenge' })
const boxes = (page: Page) => page.locator('input[data-study-key]')
const start = (page: Page) => page.getByRole('button', { name: 'Start challenge' })
const leaks = (page: Page) => page.evaluate(() => (window as unknown as { openTables: number }).openTables)

/**
 * A student: a separate browser with their own saved workspace, recording any moment the trace table has body rows
 * but nothing to fill in.
 */
async function student(browser: Browser, options: Parameters<Browser['newContext']>[0] = {}) {
  const context = await browser.newContext(options)
  await context.addInitScript((code) => {
    localStorage.setItem('tts:welcomed', '1')
    if (!localStorage.getItem('tts:v1')) localStorage.setItem('tts:v1', JSON.stringify({ state: { code }, version: 1 }))
    const w = window as unknown as { openTables: number }
    w.openTables = 0
    new MutationObserver(() => {
      const table = document.querySelector('table[aria-label="Trace table"]')
      if (table?.querySelector('tbody tr') && !table.querySelector('input[data-study-key]')) w.openTables++
    }).observe(document, { childList: true, subtree: true })
  }, OWN_CODE)
  return { context, page: await context.newPage() }
}

/** The teacher: Linear search, hide only the `i` column, copy the link. */
async function teacherLink(page: Page): Promise<string> {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
  await page.getByRole('button', { name: /study mode/i }).click()
  await page.getByRole('radio', { name: 'Some columns' }).check()
  await page.getByRole('checkbox', { name: 'i', exact: true }).check()
  await page.getByRole('button', { name: 'Copy student challenge link' }).click()
  const dialog = page.getByRole('dialog', { name: 'Student challenge link' })
  await expect(dialog).toContainText('Students fill in 3 of')
  return dialog.getByRole('textbox', { name: 'Student challenge link' }).inputValue()
}

const hashOf = (url: string) => new URL(url).hash

test('a teacher’s link opens for review, starts masked, and ends back at the student’s own work', async ({ page, browser }) => {
  const url = await teacherLink(page)
  const { context, page: kid } = await student(browser)
  await kid.goto(url)

  await expect(panel(kid)).toContainText('Nothing has been run')
  await expect(start(kid)).toBeEnabled({ timeout: 80_000 })
  await kid.waitForTimeout(1500) // Python is ready: anything that was going to auto-run would have
  await expect(traceTable(kid)).toHaveCount(0)
  await expect(kid.getByRole('button', { name: /^Run$/ })).toBeDisabled()
  await kid.keyboard.press('Control+Enter')
  await expect(traceTable(kid)).toHaveCount(0)

  await start(kid).click()
  await expect(boxes(kid)).toHaveCount(3)
  expect(await boxes(kid).evaluateAll((all) => all.map((b) => (b as HTMLElement).dataset.studyCol))).toEqual([
    '<module>:i',
    '<module>:i',
    '<module>:i',
  ])
  await expect(kid.getByRole('radio', { name: 'Some columns' })).toHaveCount(0)
  await expect(kid.getByRole('checkbox', { name: 'Only hide the Output column' })).toHaveCount(0)
  await expect(kid.getByRole('button', { name: /^Reveal / })).toHaveCount(0)
  await expect(kid.getByRole('button', { name: /export/i })).toBeDisabled()
  await expect(kid.getByRole('button', { name: 'Exit study mode' })).toHaveCount(0)

  // Ctrl+P: the print view holds a notice, not the table
  const printed = await kid.evaluate(() => {
    window.dispatchEvent(new Event('beforeprint'))
    const region = document.querySelector('[data-testid="print-region"]')!
    const out = { text: region.textContent, tables: region.querySelectorAll('table').length }
    window.dispatchEvent(new Event('afterprint'))
    return out
  })
  expect(printed).toEqual({ text: 'Printing is off during a challenge.', tables: 0 })

  await boxes(kid).nth(0).fill('0')
  await boxes(kid).nth(1).fill('7')
  await boxes(kid).nth(2).fill('2')
  await kid.getByRole('button', { name: 'Check answers' }).click()
  await expect(kid.getByText(/Score: 2 \/ 3/)).toBeVisible()
  await expect(kid.getByRole('button', { name: /^Reveal / })).toHaveCount(3)
  expect(await leaks(kid)).toBe(0)

  // a reload goes back to review, and Start brings the saved answers back
  await kid.reload()
  await expect(panel(kid)).toContainText('Nothing has been run')
  await expect(traceTable(kid)).toHaveCount(0)
  await start(kid).click({ timeout: 80_000 })
  await expect(boxes(kid).nth(1)).toHaveValue('7')
  await expect(kid.getByRole('button', { name: /^Reveal / })).toHaveCount(0)
  expect(await leaks(kid)).toBe(0)

  await kid.getByRole('button', { name: 'End challenge' }).click()
  await expect(kid.locator('.cm-content')).toContainText('student-own-code')
  await expect(traceTable(kid).getByRole('cell', { name: 'student-own-code' }).first()).toBeVisible()
  await expect(kid).toHaveURL(/\/trace-table$/)
  // positive control: their own open table is exactly what the observer is built to notice
  expect(await leaks(kid)).toBeGreaterThan(0)
  await context.close()
})

test('hand-picked cells travel in the link', async ({ page, browser }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
  await page.getByRole('button', { name: /study mode/i }).click()
  await page.getByRole('radio', { name: 'Chosen cells' }).check()
  await expect(boxes(page)).toHaveCount(0)
  await page.getByRole('button', { name: /^Blank this: Row \d+ \(line 4\), i$/ }).click()
  await page.getByRole('button', { name: /^Blank this: .*Output$/ }).click()
  await expect(boxes(page)).toHaveCount(2)
  await expect(page.getByRole('button', { name: /^Show: / }).first()).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Copy student challenge link' }).click()
  const url = await page.getByRole('textbox', { name: 'Student challenge link' }).inputValue()
  expect(decodeShare(parseShareHash(hashOf(url))!)!.workspace.studyConfig.cells).toHaveLength(2)

  const { context, page: kid } = await student(browser)
  await kid.goto(url)
  await start(kid).click({ timeout: 80_000 })
  await expect(boxes(kid)).toHaveCount(2)
  await expect(kid.getByRole('button', { name: /^(Blank this|Show):/ })).toHaveCount(0)
  expect(await leaks(kid)).toBe(0)
  await context.close()
})

test('a tampered payload falls back safely and still does not run', async ({ browser }) => {
  const { context, page } = await student(browser)
  const forged = encodeShare({ ...defaultWorkspace('print("forged-output")\n') }, { steps: -1, executionKey: '<x>' })
  await page.goto(`/trace-table#s=${forged}`)
  await expect(page.getByRole('region', { name: 'Shared workspace' })).toContainText('meant to be a student challenge')
  await expect(page.getByRole('button', { name: /^Run$/ })).toBeEnabled({ timeout: 80_000 })
  await page.waitForTimeout(1500)
  await expect(traceTable(page)).toHaveCount(0)
  await expect(start(page)).toHaveCount(0)

  // a damaged link opened in the same tab (hashchange) only raises the alert
  await page.evaluate(() => (location.hash = '#s=not-a-real-link'))
  await expect(page.getByText('That share link couldn’t be read')).toBeVisible()
  await context.close()
})

/** A real link, for a program the visitor must never see or run. */
const FOREIGN = encodeShare(defaultWorkspace('print("foreign-output")\n'))
/** Valid, but over the size the app will open: seeded noise, which compression can't shrink away. */
const oversized = () => {
  let seed = 1
  const noise = Array.from({ length: 20_000 }, () => String.fromCharCode(33 + ((seed = (seed * 48_271) % 2_147_483_647) % 90)))
  return encodeShare(defaultWorkspace(`# ${noise.join('')}\nprint("foreign-output")\n`))
}

const DAMAGED: [string, () => string][] = [
  ['random characters', () => 'Qm9ndXM7x9Kq2LzPvT4wYhN8sR1dF6gJ3cB5nMaE0uIoXyZ'.repeat(4)],
  ['a real payload cut in half', () => FOREIGN.slice(0, Math.floor(FOREIGN.length / 2))],
  ['an oversized payload', oversized],
  ['characters that are not base64', () => '!!!%%%^^^~~~***((()))'],
]

for (const [name, payload] of DAMAGED) {
  test(`a share link of ${name} only raises the alert and leaves the visitor’s work alone`, async ({ browser }) => {
    if (name === 'an oversized payload') expect(payload().length).toBeGreaterThan(MAX_SHARE_PAYLOAD)
    const { context, page } = await student(browser)
    const crashes: string[] = []
    page.on('pageerror', (e) => crashes.push(e.message))
    await page.goto(`/trace-table#s=${payload()}`)

    await expect(page.getByRole('alert').filter({ hasText: 'That share link couldn’t be read' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^Python ready$/ })).toBeVisible({ timeout: 80_000 })
    // once Python is ready the visitor's own table comes back; only then is the button Run again, not Cancel
    await expect(traceTable(page).getByRole('cell', { name: 'student-own-code' }).first()).toBeVisible()
    await page.waitForTimeout(1500) // anything else that was going to run would have
    await expect(page).toHaveURL(/\/trace-table$/)
    await expect(page.getByRole('region', { name: 'Shared workspace' })).toHaveCount(0)
    await expect(panel(page)).toHaveCount(0)
    await expect(page.locator('.cm-content')).toContainText('student-own-code')
    await expect(page.getByText('foreign-output')).toHaveCount(0)
    const saved = await page.evaluate(() => (JSON.parse(localStorage.getItem('tts:v1')!) as { state: { code: string } }).state.code)
    expect(saved).toBe(OWN_CODE)

    // still a working page
    await page.getByRole('button', { name: 'Dismiss' }).click()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.locator('.cm-content').fill('total = 40 + 2')
    await page.getByRole('button', { name: /^Run$/ }).click()
    await expect(traceTable(page).getByRole('cell', { name: '42' })).toBeVisible()
    expect(crashes).toEqual([])
    await context.close()
  })
}

test('a legacy /#s= challenge link is forwarded to the trace page and waits for Start', async ({ browser }) => {
  const { context, page } = await student(browser)
  const payload = encodeShare(defaultWorkspace('x = 1\n'), { steps: 1, executionKey: 'abc' })
  await page.goto(`/#s=${payload}`)
  await expect(page).toHaveURL(/\/trace-table#s=/)
  await expect(panel(page)).toContainText('Nothing has been run')
  await expect(traceTable(page)).toHaveCount(0)
  await context.close()
})

test('the review panel and toolbar fit a 375px phone', async ({ browser }) => {
  const { context, page } = await student(browser, { viewport: { width: 375, height: 740 } })
  await page.goto(`/trace-table#s=${encodeShare(defaultWorkspace('x = 1\n'), { steps: 1, executionKey: 'abc' })}`)
  await expect(start(page)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  const button = await page.getByRole('button', { name: 'Copy student challenge link' }).boundingBox()
  expect(button!.x + button!.width).toBeLessThanOrEqual(375)
  await context.close()
})

test.describe('axe audit of the challenge states', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no violations in ${colorScheme} mode: review, active and unreproducible`, async ({ browser }) => {
      // bypassCSP lets the test inject axe-core; the CSP itself is tested elsewhere
      const { context, page } = await student(browser, { colorScheme, bypassCSP: true })
      const audit = async () => {
        await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' })
        return page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: () => Promise<{ violations: { id: string; nodes: { target: unknown }[] }[] }> } }).axe
          return (await axe.run()).violations.map((v) => `${v.id}: ${v.nodes.map((n) => String(n.target)).join(' ; ')}`)
        })
      }
      // one step too many, so Start ends in "unreproducible"
      await page.goto(`/trace-table#s=${encodeShare(defaultWorkspace('x = 1\n'), { steps: 999, executionKey: 'abc' })}`)
      await expect(start(page)).toBeEnabled({ timeout: 80_000 })
      expect(await audit()).toEqual([])
      await start(page).click()
      await expect(panel(page)).toContainText('didn’t produce the same table')
      expect(await audit()).toEqual([])

      await page.getByRole('button', { name: 'Show the table anyway' }).click()
      await expect(boxes(page)).toHaveCount(1)

      // an active challenge, from a real link for the same program
      await page.getByRole('button', { name: 'Copy student challenge link' }).click()
      const url = await page.getByRole('textbox', { name: 'Student challenge link' }).inputValue()
      expect(await audit()).toEqual([])
      await page.keyboard.press('Escape')
      await page.evaluate((hash) => (location.hash = hash), hashOf(url))
      await start(page).click()
      await expect(panel(page)).toHaveCount(0)
      await expect(boxes(page)).toHaveCount(1)
      await expect(page.getByRole('heading', { name: 'Student challenge' })).toBeVisible()
      await boxes(page).fill('5')
      await page.getByRole('button', { name: 'Check answers' }).click()
      await expect(page.getByRole('button', { name: /^Reveal / })).toHaveCount(1)
      expect(await audit()).toEqual([])
      await context.close()
    })
  }
})
