import { describe, expect, it } from 'vitest'
import { applyColumnPrefs, CONDITION_COL, deriveColumns } from '../../src/core/derive/columns'
import { deriveRows, ONE_LINE_NOTE } from '../../src/core/derive/rows'
import { gradeAnswer } from '../../src/core/study/grade'
import { maskableCells } from '../../src/core/study/mask'
import { DEFAULT_TRACE_OPTIONS, type TraceResult, type TraceStep } from '../../src/core/types'
import { DEFAULT_HIDDEN_COLUMNS, defaultWorkspace, sanitizeWorkspace } from '../../src/core/workspace'
import { formatPythonValue } from '../../src/languages/python/format'
import { materialise } from '../../src/languages/python/materialise'
import type { WireResult } from '../../src/languages/python/protocol'
import { pythonDescriptor } from '../../src/languages/python/descriptor'
import { tableText } from './tableText'

const wires = import.meta.glob('../fixtures/wire/preset-*.json', { eager: true, import: 'default' }) as Record<
  string,
  { code: string; wire: WireResult }
>

function traceOf(id: string, wire?: WireResult): TraceResult {
  const f = wires[`../fixtures/wire/preset-${id}.json`]!
  return materialise(wire ?? f.wire, { runId: id, code: f.code, options: DEFAULT_TRACE_OPTIONS })
}

const table = (r: TraceResult, showCondition = true, granularity: 'compact' | 'every-line' = 'compact') => {
  const columns = applyColumnPrefs(deriveColumns(r, { showCondition }), { hidden: DEFAULT_HIDDEN_COLUMNS, order: [] })
  return { columns, rows: deriveRows(r, columns, formatPythonValue, { granularity, display: 'exam' }) }
}

describe.each(['linear-search', 'digit-sum'])('Condition column: %s', (id) => {
  it('matches the hand-worked golden table', async () => {
    const { columns, rows } = table(traceOf(id))
    await expect(tableText(columns, rows)).toMatchFileSnapshot(`../fixtures/presets/${id}.condition.txt`)
  })
})

describe('Condition column rules', () => {
  const linear = () => traceOf('linear-search')

  it('is opt-in, and sits just before Return and Output', () => {
    expect(table(linear(), false).columns.map((c) => c.id)).not.toContain(CONDITION_COL)
    const headers = table(linear()).columns.map((c) => c.header)
    expect(headers.slice(-2)).toEqual(['Condition', 'Output'])
  })

  it('is not offered when no step has an outcome', () => {
    const r = linear()
    const noBranches: TraceResult = { ...r, steps: r.steps.map((s): TraceStep => ({ ...s, branch: undefined })) }
    expect(deriveColumns(noBranches, { showCondition: true }).map((c) => c.id)).not.toContain(CONDITION_COL)
  })

  it('keeps header rows in compact mode only while the column is visible', () => {
    expect(table(linear(), false).rows.some((r) => r.lineNumber === 5)).toBe(false)
    const on = table(linear()).rows
    expect(on.filter((r) => r.lineNumber === 5).map((r) => r.cells[CONDITION_COL]!.display)).toEqual([
      'True',
      'True',
      'True',
      'False',
    ])
    const hidden = deriveColumns(linear(), { showCondition: true }).filter((c) => c.id !== CONDITION_COL)
    expect(deriveRows(linear(), hidden, formatPythonValue).some((r) => r.lineNumber === 5)).toBe(false)
  })

  it('makes boolean cells maskable and graded by the existing Python grader', () => {
    const { columns, rows } = table(linear())
    const cells = maskableCells(rows, columns).filter((c) => c.colId === CONDITION_COL)
    expect(cells).toHaveLength(7)
    const truth = cells.at(-1)!.truth
    const grader = {
      formatValue: formatPythonValue,
      parseAnswer: pythonDescriptor.parseAnswer!,
      looseParse: pythonDescriptor.looseParse,
    }
    expect(gradeAnswer('False', truth, grader).state).toBe('correct')
    expect(gradeAnswer('false', truth, grader).state).toBe('close')
    expect(gradeAnswer('True', truth, grader).state).toBe('incorrect')
  })

  it('shows ? for a one-line body, keeps the row, and never asks about it', () => {
    const base = linear()
    // as the tracer reports `if x: y`: no branch on the step, `oneLine` on the line
    const r: TraceResult = {
      ...base,
      steps: base.steps.map((s) => (s.lineNumber === 6 ? { ...s, branch: undefined } : s)),
      lines: { ...base.lines, 6: { ...base.lines![6]!, oneLine: true } },
    }
    const { columns, rows } = table(r)
    const six = rows.filter((x) => x.lineNumber === 6)
    expect(six).toHaveLength(3)
    for (const row of six) {
      expect(row.cells[CONDITION_COL]).toEqual({ display: '?', written: false, note: ONE_LINE_NOTE })
    }
    expect(maskableCells(rows, columns).some((c) => six.some((x) => x.rowIndex === c.rowIndex))).toBe(false)
  })

  it('leaves the cell blank when a header has no outcome for another reason (it raised)', () => {
    const base = linear()
    const r: TraceResult = {
      ...base,
      steps: base.steps.map((s) =>
        s.lineNumber === 6
          ? { ...s, branch: undefined, exception: { type: 'IndexError', message: 'x', caught: false } }
          : s,
      ),
    }
    const six = table(r).rows.filter((x) => x.lineNumber === 6)
    expect(six.every((x) => x.cells[CONDITION_COL]!.display === '')).toBe(true)
  })

  it('still loads a trace recorded before static line info existed', () => {
    const { lines, ...old } = wires['../fixtures/wire/preset-linear-search.json']!.wire
    expect(lines).toBeDefined()
    const r = traceOf('linear-search', old)
    expect(r.lines).toBeUndefined()
    expect(table(r).rows).toHaveLength(15)
  })

  it('materialises line info into the language-neutral shape', () => {
    expect(linear().lines![5]).toEqual({
      kind: 'while',
      expr: {
        text: 'i < len(items) and not found',
        parts: ['', { name: 'i' }, ' < len(', { name: 'items' }, ') and (not ', { name: 'found' }, ')'],
        pure: true,
      },
    })
  })

  it('is off for workspaces saved before the setting existed, and only a boolean turns it on', () => {
    const fallback = defaultWorkspace()
    expect(sanitizeWorkspace({ code: 'x = 1', hiddenColumns: ['stack'] }, fallback).showCondition).toBe(false)
    expect(sanitizeWorkspace({ showCondition: 'yes' }, fallback).showCondition).toBe(false)
    expect(sanitizeWorkspace({ showCondition: true }, fallback).showCondition).toBe(true)
  })
})
