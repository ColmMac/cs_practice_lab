import { describe, expect, it } from 'vitest'
import { toCsv } from '../../src/core/export/csv'
import { toLatex } from '../../src/core/export/latex'
import { toMarkdown } from '../../src/core/export/markdown'
import { buildTruthTableModel, truthBaseName } from '../../src/core/export/truthModel'
import { buildTruthTable, DEFAULT_TRUTH_STUDY, findLogicPreset, parseProgram, truthMasks } from '../../src/core/logic'

const preset = (id: string) => findLogicPreset(id)!.source
const table = (src: string, o?: Parameters<typeof buildTruthTable>[1]) => buildTruthTable(parseProgram(src), o)

// The goldens in tests/fixtures/export/truth-* were read by hand against the half adder (S = A XOR B, C = A AND B):
// rows 00 → S0 C0, 01 → S1 C0, 10 → S1 C0, 11 → S0 C1. The full adder worksheet hides the output cells only.
describe('truth-table export model', () => {
  const half = table(preset('half-adder'))

  it('answer key: every cell filled, headers are the column labels', () => {
    const m = buildTruthTableModel(half, { variant: 'key' })
    expect(m.title).toBe('Truth table')
    expect(m.columns.map((c) => c.header)).toEqual(['A', 'B', 'S', 'C'])
    expect(m.rows).toEqual([
      ['0', '0', '0', '0'],
      ['0', '1', '1', '0'],
      ['1', '0', '1', '0'],
      ['1', '1', '0', '1'],
    ])
    expect(m.code).toBeUndefined()
  })

  it('worksheet: blanks exactly the masked cells and nothing else', () => {
    const masked = truthMasks(half, DEFAULT_TRUTH_STUDY, 1) // outputs only
    const m = buildTruthTableModel(half, { variant: 'worksheet', masked })
    expect(m.title).toBe('Truth table (worksheet)')
    expect(m.rows).toEqual([
      ['0', '0', '', ''],
      ['0', '1', '', ''],
      ['1', '0', '', ''],
      ['1', '1', '', ''],
    ])
    expect(masked.size).toBe(8)
  })

  it('a key ignores the mask, and a worksheet with no mask is a full table', () => {
    const masked = truthMasks(half, DEFAULT_TRUTH_STUDY, 1)
    expect(buildTruthTableModel(half, { variant: 'key', masked }).rows[0]).toEqual(['0', '0', '0', '0'])
    expect(buildTruthTableModel(half, { variant: 'worksheet' }).rows[3]).toEqual(['1', '1', '0', '1'])
  })

  it('the expression is a code block only when asked for', () => {
    const src = preset('half-adder') + '\n\n'
    expect(buildTruthTableModel(half, { variant: 'key', expression: src }).code).toBeUndefined()
    const m = buildTruthTableModel(half, { variant: 'key', expression: src, includeCode: true })
    expect(m.code).toBe('S = A XOR B\nC = A AND B')
    expect(m.codeLanguage).toBe('text')
    expect(toMarkdown(m).startsWith('```text\nS = A XOR B\nC = A AND B\n```\n')).toBe(true)
  })

  it('uses the table notation (T / F) as shown', () => {
    const m = buildTruthTableModel(table('Q = A AND B', { notation: 'TF' }), { variant: 'key' })
    expect(m.rows[3]).toEqual(['T', 'T', 'T'])
  })

  it('base names', () => {
    expect(truthBaseName('key')).toBe('truth-table')
    expect(truthBaseName('worksheet')).toBe('truth-table-worksheet')
  })

  it('CSV keeps the formula guard (an expression with = never reaches a cell, but the guard stays)', () => {
    const m = buildTruthTableModel(half, { variant: 'key' })
    m.rows[0]![0] = '=1+1'
    expect(toCsv(m)).toContain("'=1+1")
  })
})

describe('golden export files (hand-reviewed)', () => {
  const full = table(preset('full-adder'), { intermediates: true })
  const masked = truthMasks(full, { mask: 'outputs', percent: 50 }, 1)
  const key = buildTruthTableModel(table(preset('half-adder')), { variant: 'key', expression: preset('half-adder'), includeCode: true })
  const sheet = buildTruthTableModel(full, { variant: 'worksheet', masked })

  it('half adder key: Markdown with the expression', async () => {
    await expect(toMarkdown(key)).toMatchFileSnapshot('../fixtures/export/truth-half-adder.key.md')
  })
  it('half adder key: CSV', async () => {
    await expect(toCsv(key)).toMatchFileSnapshot('../fixtures/export/truth-half-adder.key.csv')
  })
  it('half adder key: LaTeX fragment', async () => {
    await expect(toLatex(key)).toMatchFileSnapshot('../fixtures/export/truth-half-adder.key.tex')
  })
  it('full adder worksheet (intermediates shown, outputs blank): Markdown', async () => {
    await expect(toMarkdown(sheet)).toMatchFileSnapshot('../fixtures/export/truth-full-adder.worksheet.md')
  })
})
