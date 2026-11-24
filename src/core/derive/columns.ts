import type { ColumnDef, ColumnId, TraceResult, WatchExpression } from '../types'

export const LINE_COL = 'line'
export const RETURN_COL = 'return'
export const OUTPUT_COL = 'output'
export const STACK_COL = 'stack'
export const WATCH_PREFIX = 'watch:'

export const watchColumnId = (watchId: string): ColumnId => `${WATCH_PREFIX}${watchId}`

export interface ColumnOptions {
  showEphemeral?: boolean
  /** Enabled watches get a column each (after the variables). */
  watches?: WatchExpression[]
}

/**
 * Every column that COULD be shown for this trace, in default order:
 * Line · variables (grouped by scope, module first, each group in order of first appearance) ·
 * watches · Return (if any function returned explicitly) · Output (if anything printed) ·
 * Call stack (if any function was called).
 * Which of them are visible, and in what order, is a separate user preference: `applyColumnPrefs`.
 */
export function deriveColumns(result: TraceResult, opts: ColumnOptions = {}): ColumnDef[] {
  const cols: ColumnDef[] = [{ id: LINE_COL, header: 'Line', kind: 'meta' }]

  const vars = result.variables.filter((v) => opts.showEphemeral || !v.ephemeral)
  const scopeOrder = ['<module>', ...result.functions]
  for (const v of vars) if (!scopeOrder.includes(v.scopeName)) scopeOrder.push(v.scopeName)

  for (const scope of scopeOrder) {
    vars
      .filter((v) => v.scopeName === scope)
      .sort((a, b) => a.firstStep - b.firstStep)
      .forEach((v) => cols.push({ id: v.columnId, header: v.name, group: scope, kind: 'var' }))
  }

  for (const w of opts.watches ?? []) {
    if (w.enabled) cols.push({ id: watchColumnId(w.id), header: w.label?.trim() || w.expr.trim() || '(empty)', kind: 'watch' })
  }

  if (result.steps.some((s) => s.returnValue)) cols.push({ id: RETURN_COL, header: 'Return', kind: 'meta' })
  if (result.steps.some((s) => s.stdoutDelta)) cols.push({ id: OUTPUT_COL, header: 'Output', kind: 'meta' })
  if (result.steps.some((s) => s.callStack.length > 1)) cols.push({ id: STACK_COL, header: 'Call stack', kind: 'meta' })
  return cols
}

export interface ColumnPrefs {
  hidden: readonly ColumnId[]
  order: readonly ColumnId[]
}

const orderable = (c: ColumnDef) => c.kind === 'var' || c.kind === 'watch'

/**
 * Hides the columns the user turned off and applies their ordering to the variable/watch columns.
 * Line / Return / Output / Call stack keep their slots; ids the order list doesn't know keep their
 * default relative position after the ones it does.
 */
export function applyColumnPrefs(cols: ColumnDef[], prefs: ColumnPrefs): ColumnDef[] {
  const visible = cols.filter((c) => !prefs.hidden.includes(c.id))
  const movable = visible.filter(orderable)
  const rank = (c: ColumnDef, i: number) => {
    const at = prefs.order.indexOf(c.id)
    return at >= 0 ? at : prefs.order.length + i
  }
  const sorted = movable.map((c, i) => ({ c, r: rank(c, i) })).sort((a, b) => a.r - b.r).map((x) => x.c)
  let next = 0
  return visible.map((c) => (orderable(c) ? sorted[next++]! : c))
}

/** New order after moving `id` one place up (-1) or down (+1) within the movable columns (`current`, in display order). */
export function moveColumn(current: readonly ColumnId[], id: ColumnId, delta: -1 | 1): ColumnId[] {
  const i = current.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= current.length) return [...current]
  const next = [...current]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

export interface ColumnView extends ColumnPrefs, ColumnOptions {}

/**
 * `all`: every column that could be shown, in the user's order (what the Column Manager lists).
 * `visible`: the ones the table shows. Shared by the table, the Column Manager and Study Mode.
 */
export function resolveColumns(result: TraceResult, view: ColumnView): { all: ColumnDef[]; visible: ColumnDef[] } {
  const derived = deriveColumns(result, { showEphemeral: view.showEphemeral, watches: view.watches })
  return {
    all: applyColumnPrefs(derived, { hidden: [], order: view.order }),
    visible: applyColumnPrefs(derived, { hidden: view.hidden, order: view.order }),
  }
}


/** Human label for a column: `fact.n` for a variable in a function, plain header otherwise. */
export function columnLabel(c: ColumnDef): string {
  return c.kind === 'var' && c.group !== '<module>' ? `${c.group}.${c.header}` : c.header
}
