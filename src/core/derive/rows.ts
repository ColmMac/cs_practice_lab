import type { Cell, ColumnDef, TraceResult, TraceRow, Value } from '../types'
import { LINE_COL, OUTPUT_COL, RETURN_COL } from './columns'

/** Printed text for a table cell: one trailing newline is implied, a lone newline shows as ⏎. */
export function formatOutput(delta: string): string {
  if (delta === '\n') return '⏎'
  return delta.endsWith('\n') ? delta.slice(0, -1) : delta
}

/**
 * Every-line rows with "carry forward" cells: each variable cell shows the variable's current value
 * (blank before it exists / after its frame ends); `written` marks the cells this step changed.
 * Language-agnostic: the language supplies `format`.
 */
export function deriveRows(result: TraceResult, columns: ColumnDef[], format: (v: Value) => string): TraceRow[] {
  const meta = new Map(result.variables.map((v) => [v.columnId, v]))
  const frameName = new Map<number, string>()
  for (const s of result.steps) for (const f of s.callStack) frameName.set(f.id, f.name)

  return result.steps.map((step, rowIndex) => {
    const written = new Set(step.writes.map((w) => `${frameName.get(w.frameId)}:${w.name}`))
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
        cells[col.id] = { value, display: value ? format(value) : '', written: written.has(col.id) }
      }
    }
    return { rowIndex, stepIndices: [step.stepIndex], lineNumber: step.lineNumber, depth: step.frame.depth, cells }
  })
}
