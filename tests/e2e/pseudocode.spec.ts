import { expect, test, type Page } from '@playwright/test'
import { encodeShare } from '../../src/core/share/urlState'
import { defaultWorkspace } from '../../src/core/workspace'
import { axeViolations } from './axe'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('tts:welcomed', '1'))
})

const traceTable = (page: Page) => page.getByRole('table', { name: 'Trace table' })
const pseudo = (page: Page) => page.getByRole('list', { name: 'Exam pseudocode lines' })
const toggle = (page: Page) => page.getByRole('button', { name: /Exam pseudocode/ })
const lineTexts = async (page: Page) => (await pseudo(page).locator('li').allTextContents()).map((t) => t.trim())

async function loadLinearSearch(page: Page) {
  await page.goto('/trace-table')
  await page.getByLabel('Example').selectOption({ label: 'Linear search (while + flag)' })
  await expect(traceTable(page).getByRole('cell', { name: 'True 2' })).toBeVisible({ timeout: 80_000 })
}

test('shows each board’s keywords and highlights the line behind the selected row', async ({ page }) => {
  await loadLinearSearch(page)
  await expect(pseudo(page)).toHaveCount(0) // closed by default
  await toggle(page).click()

  await expect(pseudo(page)).toContainText('WHILE i < LEN(items) AND NOT found')
  expect(await lineTexts(page)).toContain('ENDWHILE')

  await traceTable(page).locator('tbody tr[data-line="9"]').first().click()
  await expect(pseudo(page).locator('li[aria-current="true"]')).toHaveText('i ← i + 1')

  // line 5 (the while) writes nothing, so its rows appear once the Condition column is on
  await page.getByRole('button', { name: /^Columns/ }).click()
  await page.getByRole('checkbox', { name: /Condition \(True\/False\)/ }).check()
  await page.keyboard.press('Escape')
  await traceTable(page).locator('tbody tr[data-line="5"]').first().click()
  await expect(pseudo(page).locator('li[aria-current="true"]')).toHaveText('WHILE i < LEN(items) AND NOT found')

  await page.getByRole('radio', { name: 'OCR' }).click()
  await expect(pseudo(page)).toContainText('while i < items.length AND NOT found')
  expect(await lineTexts(page)).toContain('endwhile')

  await page.getByRole('radio', { name: 'SQA' }).click()
  await expect(pseudo(page)).toContainText('WHILE i < LENGTH(items) AND NOT found DO')
  expect(await lineTexts(page)).toContain('END WHILE')

  // the board is remembered
  await page.reload()
  await toggle(page).click()
  await expect(page.getByRole('radio', { name: 'SQA' })).toBeChecked()
})

test('a syntax error and a construct with no equivalent are both reported honestly', async ({ page }) => {
  await loadLinearSearch(page)
  await toggle(page).click()
  await expect(pseudo(page)).toContainText('ENDWHILE')

  // converting the table's program, so editing alone changes nothing but the note
  await page.locator('.cm-content').fill('while True\n    pass')
  await expect(page.getByText('This pseudocode matches the table')).toBeVisible()
  await expect(pseudo(page)).toContainText('ENDWHILE')

  await page.getByRole('button', { name: /^Run$/ }).click()
  await expect(page.getByRole('alert').filter({ hasText: /Line 1: This is not valid Python yet/ })).toBeVisible()
  await expect(pseudo(page)).toHaveCount(0)

  await page.locator('.cm-content').fill('squares = [n * n for n in range(4)]\nprint(squares)')
  await page.waitForTimeout(1000) // Run has a one-second cooldown
  await page.getByRole('button', { name: /^Run$/ }).click()
  await expect(pseudo(page).locator('li').first()).toContainText('squares = [n * n for n in range(4)]')
  await expect(pseudo(page).locator('li').first()).toContainText('no exam equivalent')
  await expect(pseudo(page).locator('li').nth(1)).toHaveText('OUTPUT squares')
})

test('shared code under review can be read as pseudocode but is not run', async ({ page }) => {
  await page.goto(`/trace-table#s=${encodeShare(defaultWorkspace('total = 0\nfor i in range(3):\n    total += i'))}`)
  await toggle(page).click()
  await expect(pseudo(page)).toContainText('FOR i ← 0 TO 2', { timeout: 80_000 })
  await expect(pseudo(page)).toContainText('total ← total + i')
  await expect(traceTable(page)).toHaveCount(0)
})

test.describe('axe audit with the pseudocode panel open', () => {

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`no violations in ${colorScheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme })
      await page.goto('/trace-table')
      await page.getByLabel('Example').selectOption({ label: 'Bubble sort (nested loops, swap)' })
      await expect(traceTable(page).locator('tbody tr').first()).toBeVisible({ timeout: 80_000 })
      await toggle(page).click()
      await expect(pseudo(page)).toContainText('ENDFOR')
      // a selected line and a marked line are both on screen
      await traceTable(page).locator('tbody tr[data-line="1"]').first().click()
      await expect(pseudo(page).locator('li[aria-current="true"]')).toHaveCount(1)
      await expect(pseudo(page)).toContainText('no exam equivalent')
      const violations = await axeViolations(page)
      expect(violations).toEqual([])
    })
  }
})

test('on a phone-width screen the open panel causes no sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await loadLinearSearch(page)
  await toggle(page).click()
  await expect(pseudo(page)).toContainText('ENDWHILE')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  // the table starts below the whole code column instead of lying on top of it
  const code = (await page.getByRole('region', { name: 'Code' }).boundingBox())!
  const watches = (await page.getByRole('button', { name: '+ Add watch' }).boundingBox())!
  const trace = (await page.getByRole('region', { name: 'Trace', exact: true }).boundingBox())!
  expect(watches.y + watches.height).toBeLessThanOrEqual(trace.y)
  expect(code.y + code.height).toBeLessThanOrEqual(trace.y)
  await page.getByRole('button', { name: '+ Add watch' }).click() // nothing intercepts it
})
