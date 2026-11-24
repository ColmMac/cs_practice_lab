import { describe, expect, it } from 'vitest'
import { deriveColumns } from '../../src/core/derive/columns'
import { deriveRows, formatOutput } from '../../src/core/derive/rows'
import { formatPythonValue } from '../../src/languages/python/format'
import { traces } from './fixtures'

const fmt = formatPythonValue

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
    const r = { ...traces.digitSum, variables: traces.digitSum.variables.map((v) => (v.name === 'digit' ? { ...v, ephemeral: true } : v)) }
    expect(deriveColumns(r).map((c) => c.header)).not.toContain('digit')
    expect(deriveColumns(r, { showEphemeral: true }).map((c) => c.header)).toContain('digit')
  })
})

describe('deriveRows', () => {
  it('one row per executed line, carry-forward values, written cells flagged', () => {
    const cols = deriveColumns(traces.digitSum)
    const rows = deriveRows(traces.digitSum, cols, fmt)
    expect(rows).toHaveLength(20)

    // row 0: `n = 1234`
    expect(rows[0]!.cells.line!.display).toBe('1')
    expect(rows[0]!.cells['<module>:n']).toMatchObject({ display: '1234', written: true })
    expect(rows[0]!.cells['<module>:total']).toMatchObject({ display: '', written: false })

    // a `while` test row changes nothing but still carries values
    const cond = rows.find((r) => r.lineNumber === 3)!
    expect(cond.cells['<module>:n']!.display).toBe('1234')
    expect(Object.values(cond.cells).some((c) => c.written)).toBe(false)

    // last row carries the print output
    expect(rows.at(-1)!.cells.output).toMatchObject({ display: '10', written: true })
  })

  it('recursion: the column shows the innermost live frame, rows indent by depth', () => {
    const cols = deriveColumns(traces.factorial)
    const rows = deriveRows(traces.factorial, cols, fmt)
    const depths = rows.map((r) => r.depth)
    expect(Math.max(...depths)).toBe(3)
    const calls = traces.factorial.steps.filter((s) => s.kind === 'call').map((s) => s.stepIndex)
    expect(calls.map((i) => rows[i]!.cells['fact:n']!.display)).toEqual(['3', '2', '1'])
    const rets = rows.filter((r) => r.cells.return!.written)
    expect(rets.map((r) => r.cells.return!.display)).toEqual(['1', '2', '6'])
  })

  it('formatOutput trims one trailing newline and shows a blank line as ⏎', () => {
    expect(formatOutput('10\n')).toBe('10')
    expect(formatOutput('a\nb\n')).toBe('a\nb')
    expect(formatOutput('a')).toBe('a')
    expect(formatOutput('\n')).toBe('⏎')
  })
})
