import type { Cell, ColumnDef, TraceResult, TraceRow, TraceStep, Value, WatchResult } from '../types'
import { LINE_COL, OUTPUT_COL, RETURN_COL, STACK_COL, WATCH_PREFIX } from './columns'

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

/** Identity of a watch result, for "did it change?". Leaving scope is not a change (it would add noise rows). */
function watchSig(r: WatchResult | undefined): string {
  if (!r) return 'ns'
  if (r.ok) return `v:${JSON.stringify(r.value)}`
  return r.reason === 'not-in-scope' ? 'ns' : `e:${r.message}`
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
  const watchIds = columns.filter((c) => c.id.startsWith(WATCH_PREFIX)).map((c) => c.id.slice(WATCH_PREFIX.length))

  const writtenIds = (step: TraceStep) => new Set(step.writes.map((w) => `${frameName.get(w.frameId)}:${w.name}`))

  /** Signature of each visible watch on the previous KEPT row, so "changed" means changed on screen. */
  const prevWatch = new Map<string, string>(watchIds.map((id) => [id, 'ns']))

  const rows: TraceRow[] = []
  for (const step of result.steps) {
    const written = writtenIds(step)

    const watchNow = new Map<string, { sig: string; changed: boolean }>()
    for (const id of watchIds) {
      const sig = watchSig(step.watches[id])
      watchNow.set(id, { sig, changed: sig !== 'ns' && sig !== prevWatch.get(id) })
    }

    let keep = options.granularity === 'every-line'
    if (!keep) {
      for (const id of written) if (visible.has(id)) keep = true
      if (step.stdoutDelta !== '' && visible.has(OUTPUT_COL)) keep = true
      if (step.returnValue && visible.has(RETURN_COL)) keep = true
      if (step.exception !== undefined) keep = true
      for (const w of watchNow.values()) if (w.changed) keep = true
    }
    if (!keep) continue
    for (const [id, w] of watchNow) prevWatch.set(id, w.sig)

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
      } else if (col.id === STACK_COL) {
        const label = step.callStack.slice(1).map((f) => f.argsLabel ?? f.name).join(' › ')
        cells[col.id] = { display: label, written: false }
      } else if (col.id.startsWith(WATCH_PREFIX)) {
        const id = col.id.slice(WATCH_PREFIX.length)
        const res = step.watches[id]
        const { changed } = watchNow.get(id)!
        const show = options.display === 'carry' || changed
        if (res?.ok) {
          cells[col.id] = { value: res.value, display: show ? format(res.value) : '', written: changed }
        } else if (res && res.reason !== 'not-in-scope') {
          cells[col.id] = { display: show ? '⚠' : '', written: changed, note: res.message }
        } else {
          cells[col.id] = { display: options.display === 'carry' ? '–' : '', written: false, note: 'not in scope here' }
        }
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
