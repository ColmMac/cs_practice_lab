import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildTruthTable, findLogicPreset, logicPresets, parseProgram, type TruthTable } from '../../src/core/logic'

/** Plain-text rendering used by the goldens: `|` within a column group, `||` between groups. */
function render(t: TruthTable): string {
  const widths = t.columns.map((c) => c.label.length)
  const line = (cells: string[]) =>
    cells
      .map((c, i) => {
        const sep = i === 0 ? '' : t.columns[i]!.group === t.columns[i - 1]!.group ? ' | ' : ' || '
        return sep + c.padEnd(widths[i]!)
      })
      .join('')
      .trimEnd()
  return [line(t.columns.map((c) => c.label)), ...t.rows.map((r) => line(r.cells))].join('\n') + '\n'
}

const build = (src: string, o?: Parameters<typeof buildTruthTable>[1]) => buildTruthTable(parseProgram(src), o)

describe('presets', () => {
  it('ships the six plan presets (De Morgan as its two laws)', () => {
    expect(logicPresets.map((p) => p.id)).toEqual([
      'half-adder',
      'de-morgan-and',
      'de-morgan-or',
      'alarm',
      'majority',
      'xor-from-nand',
      'full-adder',
    ])
    expect(findLogicPreset('nope')).toBeUndefined()
  })

  // Goldens in tests/fixtures/logic were derived by hand, not copied from this output.
  for (const p of logicPresets) {
    it(`${p.id} matches its hand-checked golden`, () => {
      const golden = readFileSync(resolve(process.cwd(), 'tests/fixtures/logic', `${p.id}.txt`), 'utf8').replace(/\r\n/g, '\n')
      expect(render(build(p.source, { intermediates: true }))).toBe(golden)
    })
  }

  it('flags the equivalence demos', () => {
    const eq = (id: string) => build(findLogicPreset(id)!.source).equivalent
    expect(eq('de-morgan-and')).toBe(true)
    expect(eq('de-morgan-or')).toBe(true)
    expect(eq('xor-from-nand')).toBe(true)
    expect(eq('half-adder')).toBe(false)
    expect(eq('full-adder')).toBe(false)
    expect(eq('alarm')).toBe(false)
  })
})

describe('buildTruthTable', () => {
  it('orders rows 0000 → 1111 with A as the most significant bit', () => {
    const t = build('A AND B AND C')
    expect(t.rows.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(t.rows.map((r) => r.cells.slice(0, 3).join(''))).toEqual(['000', '001', '010', '011', '100', '101', '110', '111'])
    // Variables are the mentioned ones, in A..D order.
    expect(build('D OR A').columns.map((c) => c.label)).toEqual(['A', 'D', 'Q'])
  })

  it('uses only the variables the program mentions, and 2^n rows', () => {
    expect(build('B XOR D').rows).toHaveLength(4)
    expect(build('A AND B AND C AND D').rows).toHaveLength(16)
    const none = build('1 AND 0')
    expect(none.columns.map((c) => c.group)).toEqual(['output'])
    expect(none.rows.map((r) => r.cells)).toEqual([['0']])
  })

  it('spells cells as 0/1 or T/F', () => {
    expect(build('A OR B').rows.map((r) => r.cells.join(''))).toEqual(['000', '011', '101', '111'])
    expect(build('A OR B', { notation: 'TF' }).rows.map((r) => r.cells.join(''))).toEqual(['FFF', 'FTT', 'TFT', 'TTT'])
  })

  it('omits intermediates by default and never repeats an output as an intermediate', () => {
    const t = build('NOT (A AND B)')
    expect(t.columns.map((c) => c.group)).toEqual(['input', 'input', 'output'])
    const withI = build('NOT (A AND B)', { intermediates: true })
    expect(withI.columns.map((c) => c.label)).toEqual(['A', 'B', 'A AND B', 'Q'])
    // A sub-expression equal to another output's expression is not shown twice.
    const dup = build('X = A AND B\nY = NOT (A AND B)', { intermediates: true })
    expect(dup.columns.map((c) => c.label)).toEqual(['A', 'B', 'X', 'Y'])
  })

  it('deduplicates intermediates shared by several outputs', () => {
    const t = build('S = (A XOR B) XOR C\nK = A XOR B', { intermediates: true })
    expect(t.columns.filter((c) => c.group === 'intermediate')).toEqual([])
    const u = build('S = (A XOR B) XOR C\nK = (A XOR B) AND C', { intermediates: true })
    expect(u.columns.filter((c) => c.group === 'intermediate').map((c) => c.label)).toEqual(['A XOR B'])
  })

  it('does not call a single output, or differing outputs, equivalent', () => {
    expect(build('A').equivalent).toBe(false)
    expect(build('X = A\nY = NOT A').equivalent).toBe(false)
    expect(build('X = A\nY = A AND (A OR B)').equivalent).toBe(true)
  })

  it('keeps cells aligned with columns', () => {
    for (const p of logicPresets) {
      const t = build(p.source, { intermediates: true })
      for (const r of t.rows) {
        expect(r.values).toHaveLength(t.columns.length)
        expect(r.cells).toHaveLength(t.columns.length)
      }
    }
  })
})
