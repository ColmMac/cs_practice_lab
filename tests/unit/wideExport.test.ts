import { describe, expect, it } from 'vitest'
import { printLayout } from '../../src/components/export/ExportTable'
import { splitRows } from '../../src/components/export/png'
import { toLatex } from '../../src/core/export/latex'
import { headerParts, valueWidths, type TableModel } from '../../src/core/export/tableModel'

const model = (headers: string[], rows: string[][]): TableModel => ({
  title: 'Trace table',
  variant: 'key',
  columns: headers.map((header) => ({ id: header, header })),
  rows,
})

const LIST = "[{'code': 'SE', 'places': 25}, {'code': 'IP', 'places': 40}, {'code': 'CS', 'places': 25}]"
const wide = model(
  ['Line', 'records', 'ordered', 'binary_find.records', 'binary_find.target', 'binary_find.low', 'Output'],
  [['1', LIST, LIST, LIST, "'DB'", '0', 'Passed!']],
)
const narrow = model(['Line', 'n', 'Output'], [['1', '1234', 'a\nlonger line']])

describe('column widths', () => {
  it('measures the longest LINE of a cell, ignoring the header', () => {
    expect(valueWidths(narrow)).toEqual([1, 4, 'longer line'.length])
  })

  it('stacks a dotted header only when the header is what makes the column wide', () => {
    expect(headerParts('binary_find.low', 1)).toEqual(['binary_find.', 'low'])
    expect(headerParts('binary_find.records', 80)).toEqual(['binary_find.records'])
    expect(headerParts('f.x', 1)).toEqual(['f.x'])
  })
})

describe('a long PNG is split into parts', () => {
  it('fills each part up to the budget, covering every row once', () => {
    expect(splitRows([10, 10, 10, 10, 10], 25)).toEqual([[0, 2], [2, 4], [4, 5]])
  })

  it('gives a row taller than the budget a part to itself', () => {
    expect(splitRows([10, 90, 10], 25)).toEqual([[0, 1], [1, 2], [2, 3]])
  })
})

describe('print layout', () => {
  it('leaves a narrow table on a portrait page at full size', () => {
    expect(printLayout(narrow)).toEqual({ landscape: false, fontSize: 12 })
  })

  it('turns a wide table to landscape and shrinks its text, but not below 8px', () => {
    const page = printLayout(wide)
    expect(page.landscape).toBe(true)
    expect(page.fontSize).toBeGreaterThanOrEqual(8)
    expect(page.fontSize).toBeLessThanOrEqual(12)
    const huge = model(Array.from({ length: 40 }, (_, i) => `variable_${i}`), [Array.from({ length: 40 }, () => LIST)])
    expect(printLayout(huge)).toEqual({ landscape: true, fontSize: 8 })
  })
})

describe('wide tables in LaTeX', () => {
  it('leaves a table that fits alone', () => {
    const tex = toLatex(narrow, { standalone: true })
    expect(tex).toContain('\\begin{tabular}{l l l}')
    expect(tex).not.toContain('landscape')
    expect(tex).not.toContain('\\usepackage{array}')
  })

  it('uses a landscape page and wrapping columns for long values only', () => {
    const tex = toLatex(wide, { standalone: true })
    expect(tex).toContain('\\usepackage{array}')
    expect(tex).toContain('\\usepackage[landscape,margin=1.5cm]{geometry}')
    expect(tex).toMatch(/\\begin\{tabular\}\{l >\{\\raggedright\\arraybackslash\}p\{[\d.]+em\} /)
    expect(tex).toContain('\\begin{tabular}[t]{@{}l@{}}\\texttt{binary\\_find.} \\\\ \\texttt{low}\\end{tabular}')
    expect(tex).toContain('\\begingroup\\footnotesize')
    expect(tex).toContain('\\endgroup')
  })

  it('tells a pasted snippet which packages and page it needs', () => {
    const tex = toLatex(wide)
    expect(tex).toMatch(/Needs in your preamble: .*\\usepackage\{array\}/)
    expect(tex).toContain('landscape page')
  })

  it('gives a long unbroken value places to break, without splitting an escape', () => {
    const tex = toLatex(model(['s'], [['_'.repeat(200)]]))
    const body = tex.split('\\midrule\n')[1]!
    expect(body).toContain('\\allowbreak{}')
    expect(body.split('\\_')).toHaveLength(201)
  })

  it('keeps the lines of a multi-line value in a wrapping column', () => {
    const tex = toLatex(model(['Output'], [[`${'word '.repeat(30)}\nsecond`]]))
    expect(tex).toContain('} \\newline \\texttt{second}')
  })
})
