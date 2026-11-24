import { describe, expect, it } from 'vitest'
import { applyColumnPrefs, deriveColumns, moveColumn, STACK_COL, watchColumnId } from '../../src/core/derive/columns'
import { deriveRows } from '../../src/core/derive/rows'
import type { ColumnDef, TraceResult, WatchExpression } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { traces } from './fixtures'

const fmt = formatPythonValue
const ids = (cols: ColumnDef[]) => cols.map((c) => c.id)
const watch = (id: string, expr: string, enabled = true): WatchExpression => ({ id, expr, scope: { kind: 'current' }, enabled })

describe('applyColumnPrefs', () => {
  const all = deriveColumns(traces.digitSum) // line n total digit output
  const none = { hidden: [], order: [] }

  it('shows everything by default', () => {
    expect(ids(applyColumnPrefs(all, none))).toEqual(ids(all))
  })

  it('hides columns by id, including Line and Output', () => {
    const out = applyColumnPrefs(all, { hidden: ['line', 'output', '<module>:total'], order: [] })
    expect(ids(out)).toEqual(['<module>:n', '<module>:digit'])
  })

  it('reorders variable columns; Line and Output keep their slots', () => {
    const out = applyColumnPrefs(all, { hidden: [], order: ['<module>:digit', '<module>:n', '<module>:total'] })
    expect(ids(out)).toEqual(['line', '<module>:digit', '<module>:n', '<module>:total', 'output'])
  })

  it('ids the order does not know follow the known ones in their default order', () => {
    const out = applyColumnPrefs(all, { hidden: [], order: ['<module>:digit'] })
    expect(ids(out)).toEqual(['line', '<module>:digit', '<module>:n', '<module>:total', 'output'])
  })

  it('ignores stale ids in hidden / order', () => {
    const out = applyColumnPrefs(all, { hidden: ['gone:x'], order: ['gone:y', '<module>:total'] })
    expect(ids(out)).toEqual(['line', '<module>:total', '<module>:n', '<module>:digit', 'output'])
  })

  it('hidden columns do not take part in ordering', () => {
    const out = applyColumnPrefs(all, { hidden: ['<module>:n'], order: ['<module>:digit', '<module>:total'] })
    expect(ids(out)).toEqual(['line', '<module>:digit', '<module>:total', 'output'])
  })
})

describe('moveColumn', () => {
  it('swaps with the neighbour', () => {
    expect(moveColumn(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(moveColumn(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b'])
  })
  it('does nothing at the ends or for unknown ids, and never mutates its input', () => {
    const cur = ['a', 'b', 'c']
    expect(moveColumn(cur, 'a', -1)).toEqual(['a', 'b', 'c'])
    expect(moveColumn(cur, 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(moveColumn(cur, 'zzz', 1)).toEqual(['a', 'b', 'c'])
    expect(cur).toEqual(['a', 'b', 'c'])
  })
})

describe('deriveColumns: watches and call stack', () => {
  it('adds a column per ENABLED watch, after the variables and before Return/Output', () => {
    const cols = deriveColumns(traces.watchesFn, { watches: [watch('cur', 'n'), watch('off', 'x', false)] })
    expect(ids(cols)).toEqual(['line', '<module>:result', 'fact:n', 'watch:cur', 'return', 'stack'])
    expect(cols.find((c) => c.id === 'watch:cur')).toMatchObject({ kind: 'watch', header: 'n' })
  })

  it('uses the label when given, and a placeholder for an empty expression', () => {
    const cols = deriveColumns(traces.digitSum, {
      watches: [{ ...watch('a', 'n % 10'), label: 'last digit' }, watch('b', '  ')],
    })
    expect(cols.filter((c) => c.kind === 'watch').map((c) => c.header)).toEqual(['last digit', '(empty)'])
  })

  it('offers the call-stack column only when functions were called', () => {
    expect(ids(deriveColumns(traces.factorial))).toContain(STACK_COL)
    expect(ids(deriveColumns(traces.digitSum))).not.toContain(STACK_COL)
  })

  it('watchColumnId is stable', () => {
    expect(watchColumnId('abc')).toBe('watch:abc')
  })
})

// ───────────── rows: watch cells ─────────────

const cond = watch('cond', 'i < n')
const rowsWith = (r: TraceResult, ws: WatchExpression[], opts?: Parameters<typeof deriveRows>[3], hidden: string[] = []) => {
  const cols = applyColumnPrefs(deriveColumns(r, { watches: ws }), { hidden, order: [] })
  return { cols, rows: deriveRows(r, cols, fmt, opts) }
}
const watchCol = (rows: ReturnType<typeof deriveRows>, id: string) => rows.map((r) => r.cells[watchColumnId(id)]!)

describe('rows: watch cells', () => {
  it('exam style shows a watch only when its value changes', () => {
    const { rows } = rowsWith(traces.watchesLoop, [cond], { granularity: 'every-line', display: 'exam' })
    // rows: n=3 | i=0 | while | i=1 | while | i=2 | while | i=3 | while  (post-state)
    expect(watchCol(rows, 'cond').map((c) => c.display)).toEqual(['', 'True', '', '', '', '', '', 'False', ''])
    expect(watchCol(rows, 'cond').map((c) => c.written)).toEqual([false, true, false, false, false, false, false, true, false])
  })

  it('carry style shows the current value everywhere, and – before the names exist', () => {
    const { rows } = rowsWith(traces.watchesLoop, [cond], { granularity: 'every-line', display: 'carry' })
    expect(watchCol(rows, 'cond').map((c) => c.display)).toEqual(['–', 'True', 'True', 'True', 'True', 'True', 'True', 'False', 'False'])
  })

  it('compact keeps a row when a watch changes even if no variable did, and drops the rest', () => {
    const { rows } = rowsWith(traces.watchesLoop, [cond], { granularity: 'compact', display: 'exam' }, ['<module>:n', '<module>:i'])
    // with n and i hidden, ONLY the watch's two changes (True, then False) remain
    expect(rows.map((r) => r.cells[watchColumnId('cond')]!.display)).toEqual(['True', 'False'])
  })

  it('leaving scope is not a change: it adds no rows, and blank cells are just unchanged values', () => {
    const hide = ['fact:n', '<module>:result'] // so only the watch, Return and Output decide which rows exist
    const withWatch = rowsWith(traces.watchesFn, [watch('cur', 'n')], { granularity: 'compact', display: 'exam' }, hide)
    const without = rowsWith(traces.watchesFn, [], { granularity: 'compact', display: 'exam' }, hide)
    // 3 call rows (n = 3, 2, 1) + 3 return rows. The module row `result = fact(3)` is NOT kept: there `n` is
    // out of scope, which must not count as a change.
    expect(withWatch.rows.map((r) => r.lineNumber)).toEqual([1, 1, 1, 3, 4, 4])
    expect(withWatch.rows.some((r) => r.lineNumber === 6)).toBe(false)
    // call rows add 3 rows over the Return-only table
    expect(withWatch.rows.length).toBe(without.rows.length + 3)
    // return 1 happens with n still 1 (unchanged → blank); the later returns run in fact(2) / fact(3) (changed → shown)
    expect(watchCol(withWatch.rows, 'cur').map((c) => c.display)).toEqual(['3', '2', '1', '', '2', '3'])
  })

  it('a function-scope watch reads the innermost live call from any frame', () => {
    const { rows } = rowsWith(traces.watchesFn, [watch('fn', 'n')], { granularity: 'every-line', display: 'carry' })
    const fnWatch = traces.watchesFn.steps.map((s) => s.watches.fn)
    expect(fnWatch.some((w) => w && w.ok)).toBe(true)
    expect(watchCol(rows, 'fn').length).toBe(rows.length)
  })

  it('shows ⚠ with the reason for rejected / failing watches', () => {
    const { rows } = rowsWith(traces.watchesFn, [watch('bad', 'result.pop()')], { granularity: 'every-line', display: 'carry' })
    const cell = watchCol(rows, 'bad')[0]!
    expect(cell.display).toBe('⚠')
    expect(cell.note).toMatch(/pop\(\).*change your program's state/)
  })

  it('disabled watches produce no column and no rows', () => {
    const { cols } = rowsWith(traces.watchesLoop, [watch('cond', 'i < n', false)])
    expect(ids(cols).some((i) => i.startsWith('watch:'))).toBe(false)
  })
})

describe('rows: call stack column', () => {
  it('shows the live call chain (module omitted) using the call labels', () => {
    const cols = applyColumnPrefs(deriveColumns(traces.factorial), { hidden: [], order: [] })
    const rows = deriveRows(traces.factorial, cols, fmt, { granularity: 'every-line', display: 'carry' })
    const stacks = rows.map((r) => r.cells[STACK_COL]!.display)
    expect(stacks[0]).toBe('')
    expect(stacks).toContain('fact(n=3)')
    expect(stacks).toContain('fact(n=3) › fact(n=2) › fact(n=1)')
  })
})
