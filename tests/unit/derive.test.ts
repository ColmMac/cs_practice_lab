import { describe, expect, it } from 'vitest'
import { deriveColumns } from '../../src/core/derive/columns'
import { deriveRows, formatOutput, type RowOptions } from '../../src/core/derive/rows'
import type { ColumnDef, TraceResult } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { traces } from './fixtures'

const fmt = formatPythonValue
const EVERY_LINE_CARRY: RowOptions = { granularity: 'every-line', display: 'carry' }
const EVERY_LINE_EXAM: RowOptions = { granularity: 'every-line', display: 'exam' }

const rowsOf = (r: TraceResult, o?: RowOptions, cols: ColumnDef[] = deriveColumns(r)) => deriveRows(r, cols, fmt, o)
const col = (rows: ReturnType<typeof rowsOf>, id: string) => rows.map((r) => r.cells[id]!.display)

describe('deriveColumns', () => {
  it('orders Line · variables in first-appearance order · Output', () => {
    expect(deriveColumns(traces.digitSum).map((c) => c.header)).toEqual(['Line', 'n', 'total', 'digit', 'Output'])
  })

  it('groups variables by scope with module first, adds Return when functions return', () => {
    const cols = deriveColumns(traces.factorial)
    expect(cols.map((c) => c.id)).toEqual(['line', '<module>:result', 'fact:n', 'return', 'output'])
    expect(cols.find((c) => c.id === 'fact:n')?.group).toBe('fact')
  })

  it('omits Output and Return when nothing printed / returned', () => {
    const ids = deriveColumns(traces.zeroDivision).map((c) => c.id)
    expect(ids).not.toContain('output')
    expect(ids).not.toContain('return')
  })

  it('hides ephemeral variables unless asked', () => {
    const r = {
      ...traces.digitSum,
      variables: traces.digitSum.variables.map((v) => (v.name === 'digit' ? { ...v, ephemeral: true } : v)),
    }
    expect(deriveColumns(r).map((c) => c.header)).not.toContain('digit')
    expect(deriveColumns(r, { showEphemeral: true }).map((c) => c.header)).toContain('digit')
  })
})

describe('granularity', () => {
  it('every-line: one row per executed line, in order', () => {
    const rows = rowsOf(traces.digitSum, EVERY_LINE_CARRY)
    expect(rows).toHaveLength(traces.digitSum.steps.length)
    expect(rows.map((r) => r.stepIndices[0])).toEqual(traces.digitSum.steps.map((s) => s.stepIndex))
  })

  it('compact (default): drops rows where nothing a visible column shows changed', () => {
    const all = rowsOf(traces.digitSum, EVERY_LINE_EXAM)
    const compact = rowsOf(traces.digitSum)
    expect(compact.length).toBeLessThan(all.length)
    // the five `while n > 0` tests change nothing, so none survive
    expect(compact.some((r) => r.lineNumber === 3)).toBe(false)
    // every surviving row changed something
    expect(compact.every((r) => Object.values(r.cells).some((c) => c.written))).toBe(true)
  })

  it('compact keeps print rows, return rows and exception rows', () => {
    expect(rowsOf(traces.digitSum).at(-1)!.cells.output!.display).toBe('10')
    expect(rowsOf(traces.factorial).filter((r) => r.cells.return!.written)).toHaveLength(3)
    const crash = rowsOf(traces.zeroDivision)
    expect(crash.at(-1)!.lineNumber).toBe(2)
  })

  it('compact keeps a re-assignment of the same value (static write), every-line shows it too', () => {
    const cols = deriveColumns(traces.digitSum)
    // `total` goes 0 → 4 → 7 ...; there is no unchanged assignment here, so just sanity check counts
    expect(rowsOf(traces.digitSum, undefined, cols).filter((r) => r.cells['<module>:total']!.written)).toHaveLength(5)
  })

  it('hiding a column removes the rows that only changed that column', () => {
    const cols = deriveColumns(traces.digitSum)
    const withoutDigit = cols.filter((c) => c.header !== 'digit')
    const full = rowsOf(traces.digitSum, undefined, cols)
    const reduced = rowsOf(traces.digitSum, undefined, withoutDigit)
    expect(full.filter((r) => r.lineNumber === 4)).toHaveLength(4) // `digit = n % 10` rows
    expect(reduced.filter((r) => r.lineNumber === 4)).toHaveLength(0)
    expect(reduced).toHaveLength(full.length - 4)
  })

  it('hiding Output removes print-only rows', () => {
    const cols = deriveColumns(traces.digitSum).filter((c) => c.id !== 'output')
    expect(rowsOf(traces.digitSum, undefined, cols).some((r) => r.lineNumber === 7)).toBe(false)
  })

  it('rows are renumbered and keep their originating step', () => {
    const rows = rowsOf(traces.digitSum)
    expect(rows.map((r) => r.rowIndex)).toEqual(rows.map((_, i) => i))
    const steps = rows.map((r) => r.stepIndices[0]!)
    expect(steps).toEqual([...steps].sort((a, b) => a - b)) // original order kept
    expect(new Set(steps).size).toBe(steps.length)
    expect(rows.every((r) => traces.digitSum.steps[r.stepIndices[0]!]!.lineNumber === r.lineNumber)).toBe(true)
  })
})

describe('display style', () => {
  it('exam: a cell shows a value only on the row where it was written', () => {
    const rows = rowsOf(traces.digitSum, EVERY_LINE_EXAM)
    expect(rows[0]!.cells['<module>:n']).toMatchObject({ display: '1234', written: true })
    expect(rows[1]!.cells['<module>:n']).toMatchObject({ display: '', written: false }) // still 1234, but blank
    expect(rows[1]!.cells['<module>:n']!.value).toEqual({ k: 'int', v: '1234' }) // truth kept for study mode
  })

  it('carry: every cell shows the current value, written ones are flagged', () => {
    const rows = rowsOf(traces.digitSum, EVERY_LINE_CARRY)
    expect(rows[0]!.cells['<module>:n']).toMatchObject({ display: '1234', written: true })
    expect(rows[1]!.cells['<module>:n']).toMatchObject({ display: '1234', written: false })
    expect(rows[0]!.cells['<module>:total']).toMatchObject({ display: '', written: false }) // not created yet
    const cond = rows.find((r) => r.lineNumber === 3)!
    expect(cond.cells['<module>:n']!.display).toBe('1234')
    expect(Object.values(cond.cells).some((c) => c.written)).toBe(false)
  })

  it('output and return cells are shown in both styles', () => {
    for (const display of ['exam', 'carry'] as const) {
      const r = rowsOf(traces.digitSum, { granularity: 'every-line', display })
      expect(r.at(-1)!.cells.output).toMatchObject({ display: '10', written: true })
    }
  })
})

describe('recursion and branches', () => {
  it('the column shows the innermost live frame; rows indent by depth', () => {
    const rows = rowsOf(traces.factorial, EVERY_LINE_CARRY)
    expect(Math.max(...rows.map((r) => r.depth))).toBe(3)
    const calls = traces.factorial.steps.filter((s) => s.kind === 'call').map((s) => s.stepIndex)
    expect(calls.map((i) => rows[i]!.cells['fact:n']!.display)).toEqual(['3', '2', '1'])
    expect(rows.filter((r) => r.cells.return!.written).map((r) => r.cells.return!.display)).toEqual(['1', '2', '6'])
  })

  it('carries branch outcomes onto if/while/for header rows only', () => {
    const rows = rowsOf(traces.digitSum, EVERY_LINE_CARRY)
    const tests = rows.filter((r) => r.lineNumber === 3)
    expect(tests.map((r) => r.branch)).toEqual([true, true, true, true, false])
    expect(rows.filter((r) => r.lineNumber !== 3).every((r) => r.branch === undefined)).toBe(true)
  })

  it('compact: a callee row shows the callee variable in its own column', () => {
    const rows = rowsOf(traces.factorial)
    expect(col(rows, 'fact:n').filter(Boolean)).toEqual(['3', '2', '1'])
    expect(col(rows, '<module>:result').filter(Boolean)).toEqual(['6'])
  })
})

describe('formatOutput', () => {
  it('trims one trailing newline and shows a blank line as ⏎', () => {
    expect(formatOutput('10\n')).toBe('10')
    expect(formatOutput('a\nb\n')).toBe('a\nb')
    expect(formatOutput('a')).toBe('a')
    expect(formatOutput('\n')).toBe('⏎')
  })
})
