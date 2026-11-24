import { describe, expect, it } from 'vitest'
import { applyColumnPrefs, deriveColumns } from '../../src/core/derive/columns'
import { deriveRows } from '../../src/core/derive/rows'
import { CSV_BOM, toCsv } from '../../src/core/export/csv'
import { toLatex } from '../../src/core/export/latex'
import { toMarkdown } from '../../src/core/export/markdown'
import { buildTableModel } from '../../src/core/export/tableModel'
import { maskableCells, selectMasks } from '../../src/core/study/mask'
import { DEFAULT_STUDY_CONFIG } from '../../src/core/study/types'
import type { TraceResult } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { traces } from './fixtures'

// Real tables rendered in every format and saved under tests/fixtures/export/. A freshly written snapshot proves
// nothing: these files were read by hand (see PLAN.md §15) before being accepted.

const CODE: Record<string, string> = {
  digitSum: 'n = 1234\ntotal = 0\nwhile n > 0:\n    digit = n % 10\n    total = total + digit\n    n = n // 10\nprint(total)\n',
  factorial: 'def fact(n):\n    if n <= 1:\n        return 1\n    return n * fact(n - 1)\n\nresult = fact(3)\nprint(result)\n',
}

function table(result: TraceResult, code: string, variant: 'key' | 'worksheet', includeCode: boolean) {
  const columns = applyColumnPrefs(deriveColumns(result), { hidden: ['stack'], order: [] })
  const rows = deriveRows(result, columns, formatPythonValue)
  // a worksheet that hides the program's working but leaves the Line column and the printed output visible
  const masked = selectMasks(maskableCells(rows, columns), { ...DEFAULT_STUDY_CONFIG, maskMode: 'columns', columns: columns.filter((c) => c.kind === 'var' || c.id === 'return').map((c) => c.id) }, 1)
  return buildTableModel(columns, rows, { variant, masked, includeCode, code, codeLanguage: 'python' })
}

describe('golden export files (hand-reviewed)', () => {
  it('digit-sum: answer key, Markdown with the program', async () => {
    await expect(toMarkdown(table(traces.digitSum, CODE.digitSum!, 'key', true))).toMatchFileSnapshot('../fixtures/export/digit-sum.key.md')
  })

  it('digit-sum: worksheet, Markdown (variables blank, Output kept)', async () => {
    await expect(toMarkdown(table(traces.digitSum, CODE.digitSum!, 'worksheet', false))).toMatchFileSnapshot('../fixtures/export/digit-sum.worksheet.md')
  })

  it('digit-sum: CSV (CRLF, no BOM in the text itself)', async () => {
    await expect(toCsv(table(traces.digitSum, CODE.digitSum!, 'key', false))).toMatchFileSnapshot('../fixtures/export/digit-sum.key.csv')
  })

  it('digit-sum: LaTeX fragment', async () => {
    await expect(toLatex(table(traces.digitSum, CODE.digitSum!, 'key', false))).toMatchFileSnapshot('../fixtures/export/digit-sum.key.tex')
  })

  it('factorial: standalone LaTeX document with the program (recursion, Return column, fact.n)', async () => {
    await expect(toLatex(table(traces.factorial, CODE.factorial!, 'key', true), { standalone: true })).toMatchFileSnapshot(
      '../fixtures/export/factorial.key.standalone.tex',
    )
  })

  it('factorial: worksheet CSV', async () => {
    await expect(toCsv(table(traces.factorial, CODE.factorial!, 'worksheet', false))).toMatchFileSnapshot('../fixtures/export/factorial.worksheet.csv')
  })

  it('the BOM is not part of the text (it is added only when downloading)', () => {
    expect(toCsv(table(traces.digitSum, CODE.digitSum!, 'key', false)).startsWith(CSV_BOM)).toBe(false)
  })
})
