import type { Cell, ColumnDef, TraceResult, TraceRow, TraceStep, Value } from '../types'
import { LINE_COL, OUTPUT_COL, RETURN_COL } from './columns'

/**
 * compact     — a row only when something a visible column shows has changed (exam style).
 * every-line  — a row for every executed line, including if/while/for condition tests.
 */
export type Granularity = 'compact' | 'every-line'

/**
 * exam   — a cell shows a value only on the row where it was written; everything else is blank
 *          (how tables are written on paper).
 * carry  — every cell shows the variable's current value; written cells are still flagged.
 */
export type DisplayStyle = 'exam' | 'carry'

export interface RowOptions {
  granularity: Granularity
  display: DisplayStyle
}

export const DEFAULT_ROW_OPTIONS: RowOptions = { granularity: 'compact', display: 'exam' }

/** Printed text for a table cell: one trailing newline is implied, a lone newline shows as ⏎. */
export function formatOutput(delta: string): string {
  if (delta === '\n') return '⏎'
  return delta.endsWith('\n') ? delta.slice(0, -1) : delta
}

/**
 * Rows for the visible `columns`. A pure function of its inputs, so toggling granularity, display
 * style or column visibility never re-runs the program. Language-agnostic: the language supplies `format`.
 */
export function deriveRows(
  result: TraceResult,
  columns: ColumnDef[],
  format: (v: Value) => string,
  options: RowOptions = DEFAULT_ROW_OPTIONS,
): TraceRow[] {
  const meta = new Map(result.variables.map((v) => [v.columnId, v]))
  const frameName = new Map<number, string>()
  for (const s of result.steps) for (const f of s.callStack) frameName.set(f.id, f.name)
  const visible = new Set(columns.map((c) => c.id))

  const writtenIds = (step: TraceStep) => new Set(step.writes.map((w) => `${frameName.get(w.frameId)}:${w.name}`))

  const keep = (step: TraceStep, written: Set<string>): boolean => {
    if (options.granularity === 'every-line') return true
    for (const id of written) if (visible.has(id)) return true
    if (step.stdoutDelta !== '' && visible.has(OUTPUT_COL)) return true
    if (step.returnValue && visible.has(RETURN_COL)) return true
    return step.exception !== undefined
  }

  const rows: TraceRow[] = []
  for (const step of result.steps) {
    const written = writtenIds(step)
    if (!keep(step, written)) continue

    const cells: Record<string, Cell> = {}
    for (const col of columns) {
      if (col.id === LINE_COL) {
        cells[col.id] = { display: String(step.lineNumber), written: false }
      } else if (col.id === RETURN_COL) {
        cells[col.id] = {
          value: step.returnValue,
          display: step.returnValue ? format(step.returnValue) : '',
          written: !!step.returnValue,
        }
      } else if (col.id === OUTPUT_COL) {
        cells[col.id] = { display: formatOutput(step.stdoutDelta), written: step.stdoutDelta !== '' }
      } else {
        const m = meta.get(col.id)
        let value: Value | undefined
        if (m) {
          // innermost live frame of that scope wins (matters for recursion)
          for (let i = step.scopes.length - 1; i >= 0; i--) {
            const sc = step.scopes[i]!
            if (sc.frame.name === m.scopeName && m.name in sc.vars) {
              value = sc.vars[m.name]
              break
            }
          }
        }
        const isWritten = written.has(col.id)
        const shown = value !== undefined && (options.display === 'carry' || isWritten)
        cells[col.id] = { value, display: shown ? format(value!) : '', written: isWritten }
      }
    }
    rows.push({
      rowIndex: rows.length,
      stepIndices: [step.stepIndex],
      lineNumber: step.lineNumber,
      depth: step.frame.depth,
      branch: step.branch,
      cells,
    })
  }
  return rows
}
