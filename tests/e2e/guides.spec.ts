import { expect, test, type Locator, type Page } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const GUIDES = [
  ['/trace-table', 'How to complete a trace table'],
  ['/truth-tables', 'How to build a truth table'],
  ['/number-systems', 'Number bases and two’s complement'],
  ['/sorting-visualizer', 'Sorting and searching in exam answers'],
] as const

const guide = (page: Page, title: string) => page.getByRole('region', { name: title })
const sideways = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

const faqMarkup = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent!) as { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] })
      .filter((b) => b['@type'] === 'FAQPage')
      .map((b) => b.mainEntity!.map((q) => [q.name, q.acceptedAnswer.text])),
  )

/** The header and body text of a table, cell by cell. */
const cells = (table: Locator) =>
  table.evaluate((t) =>
    [...t.querySelectorAll('tr')].map((row) => [...row.querySelectorAll('th, td')].map((c) => c.textContent!.trim())),
  )

for (const [path, title] of GUIDES) {
  test(`${path}: the guide is below the workspace and its FAQ matches the markup`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(path)
    const section = guide(page, title)
    await expect(section.getByRole('heading', { level: 2, name: title })).toBeAttached()
    expect((await section.boundingBox())!.y, 'the workspace keeps the first screen').toBeGreaterThanOrEqual(799)
    const footer = (await page.getByRole('contentinfo').boundingBox())!
    const box = (await section.boundingBox())!
    expect(footer.y).toBeGreaterThanOrEqual(box.y + box.height - 1)

    const questions = await section.getByRole('heading', { level: 4 }).evaluateAll((hs) =>
      hs.map((h) => [h.textContent!, h.nextElementSibling!.textContent!]),
    )
    expect(questions.length).toBeGreaterThanOrEqual(3)
    await expect.poll(() => faqMarkup(page)).toEqual([questions])
  })

  test(`${path}: the served HTML carries the guide for readers without JavaScript`, async ({ page, request }) => {
    const html = await (await request.get(path)).text()
    await page.goto('/about') // any page of ours, to parse in
    const served = await page.evaluate((source) => {
      const doc = new DOMParser().parseFromString(source, 'text/html')
      const noscript = /<noscript>([\s\S]*)<\/noscript>/.exec(source)![1]!
      const body = new DOMParser().parseFromString(noscript, 'text/html').body
      return {
        h2: body.querySelector('h2')?.textContent,
        questions: [...body.querySelectorAll('h4')].map((h) => h.textContent),
        markup: [...doc.head.querySelectorAll('script[type="application/ld+json"]')]
          .map((s) => JSON.parse(s.textContent!) as { '@type': string; mainEntity?: { name: string }[] })
          .filter((b) => b['@type'] === 'FAQPage')
          .flatMap((b) => b.mainEntity!.map((q) => q.name)),
      }
    }, html)
    expect(served.h2).toBe(title)
    expect(served.questions.length).toBeGreaterThanOrEqual(3)
    expect(served.markup).toEqual(served.questions)
  })

  test(`${path}: left out of projector mode (where there is one) and print`, async ({ page }) => {
    await page.goto(path)
    await expect(guide(page, title)).toBeVisible()
    if (path === '/trace-table') {
      await page.getByRole('button', { name: /projector/i }).click()
      await expect(guide(page, title)).toBeHidden()
      await page.getByRole('button', { name: /projector/i }).click()
      await expect(guide(page, title)).toBeVisible()
    }
    await page.emulateMedia({ media: 'print' })
    await expect(guide(page, title)).toBeHidden()
  })

  test(`${path}: at 375 px the guide doesn’t make the page scroll sideways`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(path)
    await guide(page, title).scrollIntoViewIfNeeded()
    expect(await sideways(page)).toBeLessThanOrEqual(0)
  })
}

test.describe('no guide where it would be an answer sheet', () => {
  const gone = async (page: Page, title: string) => {
    await expect(guide(page, title)).toHaveCount(0)
    await expect.poll(() => faqMarkup(page)).toEqual([])
  }

  test('a trace study link for the worked example itself', async ({ page }) => {
    await page.goto('/trace-table?preset=linear-search&study=1')
    await expect(page.locator('input[data-study-key]').first()).toBeVisible({ timeout: 80_000 })
    await gone(page, GUIDES[0][1])
  })

  test('truth-table Study mode', async ({ page }) => {
    await page.goto('/truth-tables')
    await page.getByRole('button', { name: 'Study mode', exact: true }).click()
    await gone(page, GUIDES[1][1])
    await page.getByRole('button', { name: 'Study mode: on' }).click()
    await expect(guide(page, GUIDES[1][1])).toBeVisible()
  })

  test('number practice', async ({ page }) => {
    await page.goto('/number-systems?mode=practice')
    await expect(page.getByTestId('question').first()).toBeVisible()
    await gone(page, GUIDES[2][1])
  })

  test('the sorting quiz', async ({ page }) => {
    await page.goto('/sorting-visualizer?quiz=1')
    await expect(page.getByTestId('quiz-prompt')).toBeVisible()
    await gone(page, GUIDES[3][1])
  })
})

// Each "open this example" link, run in the real tool: what the tool shows is what the guide says.
test.describe('worked examples agree with the tools', () => {
  const follow = async (page: Page, title: string, name: RegExp) => {
    await guide(page, title).getByRole('link', { name }).click()
  }

  test('linear search trace, run by the real tracer', async ({ page }) => {
    await page.goto('/trace-table')
    const title = GUIDES[0][1]
    const expected = await cells(guide(page, title).getByRole('table'))
    expect(expected).toHaveLength(9)
    await follow(page, title, /^Open this example/)
    const table = page.getByRole('table', { name: 'Trace table' })
    /** The table without the preset's watch column, which the guide says is extra. */
    const unwatched = async () => {
      const rows = await cells(table)
      const watch = rows[0]?.indexOf('i < len(items)') ?? -1
      return watch < 0 ? [] : rows.map((r) => r.filter((_, i) => i !== watch))
    }
    await expect.poll(unwatched, { timeout: 80_000 }).toEqual(expected)
    await expect(guide(page, title)).toContainText('watched expression i < len(items)')
  })

  test('truth table', async ({ page }) => {
    await page.goto('/truth-tables')
    const title = GUIDES[1][1]
    const expected = await cells(guide(page, title).getByRole('table'))
    await follow(page, title, /^Open this example/)
    await expect(page).toHaveURL(/expr=/)
    await page.getByRole('radiogroup', { name: 'Intermediate columns' }).getByRole('radio', { name: 'On' }).click()
    // the tool has an extra first row grouping the columns
    await expect.poll(async () => (await cells(page.getByRole('table', { name: 'Truth table' }))).slice(1)).toEqual(expected)
  })

  test('negating 37, and the overflow in the FAQ', async ({ page }) => {
    await page.goto('/number-systems')
    await follow(page, GUIDES[2][1], /bit sandbox/)
    await expect(page.locator('#num-bin')).toHaveValue(/^0010\s?0101$/)
    await page.getByRole('button', { name: 'Negate' }).click()
    await expect(page.locator('#num-bin')).toHaveValue(/^1101\s?1011$/)
    await expect(page.locator('#num-signed')).toHaveValue('-37')
    await expect(page.locator('#num-unsigned')).toHaveValue('219')
    await expect(page.locator('#num-hex')).toHaveValue('DB')

    await page.goto('/number-systems?mode=add&a=01100100&b=00110010')
    await expect(page.getByRole('main')).toContainText('-106')
    await expect(page.getByRole('main')).toContainText(/two positives gave a negative/i)
  })

  /** The tool's history table without its header row or its first column, which marks the current row. */
  const history = async (page: Page) =>
    (await cells(page.getByRole('main').getByRole('table'))).slice(1).map((row) => row.slice(1))

  test('bubble sort passes', async ({ page }) => {
    await page.goto('/sorting-visualizer')
    const title = GUIDES[3][1]
    const expected = (await cells(guide(page, title).getByRole('table').first())).slice(1)
    await follow(page, title, /bubble sort/)
    await expect(page.locator('#sort-list')).toHaveValue(/^5, ?2, ?4, ?1$/)
    await expect
      .poll(async () => (await history(page)).map((r) => [r[0], r.slice(1, -2).join(', '), ...r.slice(-2)]))
      .toEqual(expected)
  })

  test('binary search probes', async ({ page }) => {
    await page.goto('/sorting-visualizer')
    const title = GUIDES[3][1]
    const expected = (await cells(guide(page, title).getByRole('table').nth(1))).slice(1)
    await follow(page, title, /binary search/)
    await expect(page).toHaveURL(/algo=binary/)
    await expect.poll(async () => (await history(page)).map((r) => r.slice(0, 5))).toEqual(expected)
  })
})
