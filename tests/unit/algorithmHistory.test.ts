import { describe, expect, it } from 'vitest'
import { buildHistory, currentHistoryRow, runAlgorithm } from '../../src/core/algorithms'
import { toCsv } from '../../src/core/export/csv'
import { buildHistoryModel, historyBaseName } from '../../src/core/export/historyModel'
import { toMarkdown } from '../../src/core/export/markdown'

const SEARCH = [3, 9, 10, 23, 27, 38, 43, 82]
const headers = (data: ReturnType<typeof buildHistory>) => data.columns.map((c) => c.header)
const rows = (data: ReturnType<typeof buildHistory>) => data.rows.map((r) => r.cells)

// Every expected row below was worked by hand (see the S4.1 pass tables) before the first run.
describe('buildHistory: sorts', () => {
  it('bubble sort [5,1,4,2,8] with early exit: three passes, 9 compares, 4 swaps', () => {
    const h = buildHistory(runAlgorithm('bubble', [5, 1, 4, 2, 8]))
    expect(headers(h)).toEqual(['Pass', '[0]', '[1]', '[2]', '[3]', '[4]', 'Compares', 'Swaps'])
    expect(rows(h)).toEqual([
      ['Start', '5', '1', '4', '2', '8', '', ''],
      ['1', '1', '4', '2', '5', '8', '4', '3'],
      ['2', '1', '2', '4', '5', '8', '3', '1'],
      ['3', '1', '2', '4', '5', '8', '2', '0'],
    ])
  })

  it('insertion sort [5,1,4,2,8]: a pass per key, 7 compares, 4 shifts', () => {
    const h = buildHistory(runAlgorithm('insertion', [5, 1, 4, 2, 8]))
    expect(headers(h).slice(-2)).toEqual(['Compares', 'Shifts'])
    expect(rows(h)).toEqual([
      ['Start', '5', '1', '4', '2', '8', '', ''],
      ['1', '1', '5', '4', '2', '8', '1', '1'],
      ['2', '1', '4', '5', '2', '8', '2', '1'],
      ['3', '1', '2', '4', '5', '8', '3', '2'],
      ['4', '1', '2', '4', '5', '8', '1', '0'],
    ])
  })

  it('merge sort has levels and no move column', () => {
    const h = buildHistory(runAlgorithm('merge', [4, 3, 2, 1]))
    expect(headers(h)).toEqual(['Level', '[0]', '[1]', '[2]', '[3]', 'Compares'])
    // Level 1 merges [4][3] and [2][1]; level 2 merges the two sorted pairs.
    expect(rows(h)[0]).toEqual(['Start', '4', '3', '2', '1', ''])
    expect(rows(h)[1]!.slice(0, 5)).toEqual(['1', '3', '4', '1', '2'])
    expect(rows(h)[2]!.slice(0, 5)).toEqual(['2', '1', '2', '3', '4'])
  })

  it('each sorted row total matches the run totals', () => {
    for (const algo of ['bubble', 'insertion', 'merge'] as const) {
      const run = runAlgorithm(algo, [9, 7, 5, 3, 1])
      const h = buildHistory(run)
      const sum = (col: string) => h.rows.reduce((t, r) => t + Number(r.cells[h.columns.findIndex((c) => c.header === col)] || 0), 0)
      expect(sum('Compares')).toBe(run.comparisons)
    }
  })
})

describe('buildHistory: searches', () => {
  it('binary search for 82 shows low, mid, high and the value at each probe', () => {
    const h = buildHistory(runAlgorithm('binary', SEARCH, { target: 82 }))
    expect(headers(h)).toEqual(['Probe', 'Low', 'Mid', 'High', 'Value at mid', 'Result'])
    expect(rows(h)).toEqual([
      ['1', '0', '3', '7', '23', '23 < 82: search right'],
      ['2', '4', '5', '7', '38', '38 < 82: search right'],
      ['3', '6', '6', '7', '43', '43 < 82: search right'],
      ['4', '7', '7', '7', '82', 'Equal: found'],
    ])
  })

  it('binary search for a missing 5 ends with a not-found row (low past high)', () => {
    const h = buildHistory(runAlgorithm('binary', SEARCH, { target: 5 }))
    expect(rows(h)).toEqual([
      ['1', '0', '3', '7', '23', '23 > 5: search left'],
      ['2', '0', '1', '2', '9', '9 > 5: search left'],
      ['3', '0', '0', '0', '3', '3 < 5: search right'],
      ['', '1', '', '0', '', 'Low is past high: not found'],
    ])
  })

  it('linear search lists each item looked at', () => {
    const h = buildHistory(runAlgorithm('linear', [5, 1, 4, 2, 8], { target: 4 }))
    expect(rows(h)).toEqual([
      ['1', '0', '5', 'Not 4: move on'],
      ['2', '1', '1', 'Not 4: move on'],
      ['3', '2', '4', 'Match: found'],
    ])
    const miss = buildHistory(runAlgorithm('linear', [5, 1], { target: 9 }))
    expect(rows(miss).at(-1)).toEqual(['', '', '', 'End of list: not found'])
  })
})

describe('currentHistoryRow', () => {
  it('a sort row is current while its pass is under way', () => {
    const run = runAlgorithm('bubble', [5, 1, 4, 2, 8])
    const h = buildHistory(run)
    // Pass 1 is c,s,c,s,c,s,c + pass-end = 8 steps; pass 2 is c,c,s,c + pass-end = 5; pass 3 is c,c + pass-end = 3.
    expect(h.rows.map((r) => r.frame)).toEqual([0, 8, 13, 16])
    expect(currentHistoryRow(h, 0)).toBe(0)
    expect(currentHistoryRow(h, 1)).toBe(1)
    expect(currentHistoryRow(h, 8)).toBe(1)
    expect(currentHistoryRow(h, 9)).toBe(2)
    expect(currentHistoryRow(h, 13)).toBe(2)
    expect(currentHistoryRow(h, 16)).toBe(3)
    expect(currentHistoryRow(h, 99)).toBe(3)
  })

  it('a search row is current once its probe has been made', () => {
    const h = buildHistory(runAlgorithm('binary', SEARCH, { target: 82 }))
    expect(currentHistoryRow(h, 0)).toBe(-1)
    expect(currentHistoryRow(h, 1)).toBe(0)
    expect(currentHistoryRow(h, 2)).toBe(1)
    expect(currentHistoryRow(h, 5)).toBe(3) // the found step still points at the last probe
  })
})

// The goldens in tests/fixtures/export/history-* were read by hand against the tables above.
describe('history export (hand-reviewed goldens)', () => {
  const bubble = buildHistoryModel(buildHistory(runAlgorithm('bubble', [5, 1, 4, 2, 8])))
  const binary = buildHistoryModel(buildHistory(runAlgorithm('binary', SEARCH, { target: 82 })))

  it('the model is the table as shown', () => {
    expect(bubble.rows[1]).toEqual(['1', '1', '4', '2', '5', '8', '4', '3'])
    expect(bubble.title).toBe('Bubble sort: the array after each pass')
  })
  it('base names', () => {
    expect(historyBaseName(buildHistory(runAlgorithm('bubble', [2, 1])))).toBe('bubble-sort-passes')
    expect(historyBaseName(buildHistory(runAlgorithm('binary', [1, 2], { target: 1 })))).toBe('binary-search-probes')
  })
  it('bubble sort: Markdown', async () => {
    await expect(toMarkdown(bubble)).toMatchFileSnapshot('../fixtures/export/history-bubble.md')
  })
  it('bubble sort: CSV', async () => {
    await expect(toCsv(bubble)).toMatchFileSnapshot('../fixtures/export/history-bubble.csv')
  })
  it('binary search: Markdown', async () => {
    await expect(toMarkdown(binary)).toMatchFileSnapshot('../fixtures/export/history-binary.md')
  })
})
