import { expect, test, type Page } from '@playwright/test'
import { axeViolations, WCAG_TAGS } from './axe'

/**
 * The WCAG 2.1 A/AA audit: every route, and the states that only appear once something has been done, in both
 * themes, at desktop and phone width, on the production build under its real headers.
 */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })

/** Python is ready and the page's own first run has filled the table. */
async function traceReady(page: Page) {
  await page.goto('/trace-table')
  await expect(page.getByRole('status').filter({ hasText: /^Python ready$/ })).toBeVisible({ timeout: 80_000 })
  await expect(traceTable(page).locator('tbody tr').first()).toBeVisible({ timeout: 80_000 })
}

interface State {
  name: string
  /** Leaves the page showing what is to be audited, having waited for it. */
  open: (page: Page) => Promise<void>
}

/** A route is ready when its lazy chunk has rendered: the heading, and the thing the page is for. */
const route = (path: string, ready?: (page: Page) => Promise<void>): State => ({
  name: path,
  open: async (page) => {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await ready?.(page)
  },
})

const ROUTES: State[] = [
  route('/', (page) => expect(page.getByRole('list', { name: 'Tools' })).toBeVisible()),
  { name: '/trace-table', open: traceReady },
  route('/truth-tables', (page) => expect(page.getByRole('table', { name: 'Truth table' })).toBeVisible()),
  route('/number-systems', (page) => expect(page.getByRole('group', { name: /bit register/ }).first()).toBeVisible()),
  route('/sorting-visualizer', (page) => expect(page.getByTestId('card').first()).toBeVisible()),
  route('/about'),
  route('/privacy'),
  route('/accessibility'),
]

const STATES: State[] = [
  {
    name: 'trace study, checked, with the score by column',
    open: async (page) => {
      await traceReady(page)
      await page.getByRole('button', { name: /^Study mode/ }).click()
      await page.locator('input[data-study-key]').first().fill('nonsense')
      await page.getByRole('button', { name: 'Check answers' }).click()
      await page.getByText('By column', { exact: true }).click()
      await expect(page.getByRole('region', { name: 'Score' })).toBeVisible()
    },
  },
  {
    name: 'truth table study, checked',
    open: async (page) => {
      await page.goto('/truth-tables')
      await page.getByRole('button', { name: /^Study mode/ }).click()
      await page.locator('input[data-study-key]').first().fill('1')
      await page.getByRole('button', { name: 'Check answers' }).click()
      await expect(page.locator('[id^="study-msg-"]').first()).toContainText(/correct/i)
    },
  },
  {
    name: 'sorting mid-run',
    open: async (page) => {
      await page.goto('/sorting-visualizer')
      for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^Step$/ }).click()
      await expect(page.getByText(/^Step 3 of \d+$/)).toBeVisible()
    },
  },
  {
    name: 'number systems addition with a carry out',
    open: async (page) => {
      await page.goto('/number-systems?mode=add')
      await page.getByRole('button', { name: 'Carry out' }).click()
      await expect(page.getByTestId('carry-out').getByText('Carry', { exact: true })).toBeVisible()
    },
  },
  {
    name: 'number systems addition with a signed overflow',
    open: async (page) => {
      await page.goto('/number-systems?mode=add')
      await page.getByRole('button', { name: 'Signed overflow' }).click()
      await expect(page.getByTestId('result-bit').first().getByText('Overflow', { exact: true })).toBeVisible()
    },
  },
]

for (const theme of ['light', 'dark'] as const) {
  for (const [width, height] of [
    [1280, 800],
    [375, 740],
  ] as const) {
    test.describe(`${theme}, ${width}px`, () => {
      test.use({ viewport: { width, height } })
      test.beforeEach(async ({ page }) => {
        // set before the app's first script, so there is no flash of the other theme to audit by mistake
        await page.addInitScript((t) => localStorage.setItem('tts:theme', t), theme)
      })

      for (const { name, open } of [...ROUTES, ...STATES]) {
        test(`no WCAG A or AA violations: ${name}`, async ({ page }) => {
          await open(page)
          await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/)
          expect(await axeViolations(page, { tags: WCAG_TAGS }), `${name} (${theme}, ${width}px)`).toEqual([])
        })
      }
    })
  }
}
