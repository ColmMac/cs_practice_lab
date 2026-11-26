import { expect, test, type Page } from '@playwright/test'
import { axeViolations } from './axe'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })

async function loadLinearSearch(page: Page) {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
}

async function showCondition(page: Page) {
  await page.getByRole('button', { name: /^Columns/ }).click()
  await page.getByRole('checkbox', { name: /Condition \(True\/False\)/ }).check()
  await page.keyboard.press('Escape')
  await expect(traceTable(page).getByRole('columnheader', { name: 'Condition' })).toBeVisible()
}

test('the Condition column shows every test, including the final False, and replaces the T/F chip', async ({ page }) => {
  await loadLinearSearch(page)
  const table = traceTable(page)
  // before: condition tests write nothing, so compact mode drops them
  await expect(table.locator('tbody tr[data-line="5"]')).toHaveCount(0)
  await expect(table.getByRole('columnheader', { name: 'Condition' })).toHaveCount(0)

  await showCondition(page)

  await expect(table.locator('tbody tr')).toHaveCount(15)
  const whileRows = table.locator('tbody tr[data-line="5"]')
  await expect(whileRows).toHaveCount(4)
  const column = (await table.getByRole('columnheader').allTextContents()).indexOf('Condition')
  await expect(whileRows.last().locator('th, td').nth(column)).toHaveText('False')
  await expect(whileRows.first().locator('th, td').nth(column)).toHaveText('True')
  await expect(table.getByLabel(/^condition (true|false)$/)).toHaveCount(0)
})

test('in Study mode Condition cells are answer boxes graded with Python spelling', async ({ page }) => {
  await loadLinearSearch(page)
  await showCondition(page)
  await page.getByRole('button', { name: /study/i }).first().click()

  const boxes = traceTable(page).locator('input[data-study-col="cond"]')
  await expect(boxes).toHaveCount(7)
  await expect(traceTable(page).getByLabel(/^condition (true|false)$/)).toHaveCount(0)

  const last = boxes.last() // the final `while` test
  const first = boxes.first()
  await last.fill('False')
  await first.fill('true')
  await page.getByRole('button', { name: 'Check answers' }).click()

  const feedback = async (box: typeof last) => {
    const ids = ((await box.getAttribute('aria-describedby')) ?? '').split(' ').filter(Boolean)
    expect(ids.length).toBeGreaterThan(0)
    return (await Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).textContent()))).join(' ')
  }
  expect(await feedback(last)).toMatch(/Correct/)
  expect(await feedback(first)).toMatch(/Almost/)
})

test('a workspace saved before this setting existed opens with the column off', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return // init scripts run again on reload
    sessionStorage.setItem('seeded', '1')
    localStorage.setItem(
      'tts:v1',
      JSON.stringify({
        version: 1,
        state: { language: 'python', code: 'x = 3\nwhile x > 0:\n    x -= 1\n', hiddenColumns: ['stack'] },
      }),
    )
  })
  await page.goto('/trace-table')
  const table = traceTable(page)
  await expect(table.locator('tbody tr').first()).toBeVisible({ timeout: 80_000 })
  await expect(table.getByRole('columnheader', { name: 'Condition' })).toHaveCount(0)

  // ticking it adds the column without re-running, and the choice survives a reload
  await showCondition(page)
  await page.reload()
  await expect(table.getByRole('columnheader', { name: 'Condition' })).toBeVisible({ timeout: 80_000 })
})

test.describe('axe audit with the Condition column', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no violations in ${colorScheme} mode (table and Columns popover)`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await loadLinearSearch(page)
      await showCondition(page)
      await page.getByRole('button', { name: /^Columns/ }).click()
      const violations = await axeViolations(page)
      expect(violations).toEqual([])
    })
  }
})
