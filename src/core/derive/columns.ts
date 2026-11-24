import type { ColumnDef, TraceResult } from '../types'

export const LINE_COL = 'line'
export const RETURN_COL = 'return'
export const OUTPUT_COL = 'output'

/**
 * Columns for a trace: Line · variables (grouped by scope, module first, each group in order of
 * first appearance) · Return (if any function returned explicitly) · Output (if anything printed).
 * Pure function of the result, so it never needs the code to be re-run.
 */
export function deriveColumns(result: TraceResult, opts: { showEphemeral?: boolean } = {}): ColumnDef[] {
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

  if (result.steps.some((s) => s.returnValue)) cols.push({ id: RETURN_COL, header: 'Return', kind: 'meta' })
  if (result.steps.some((s) => s.stdoutDelta)) cols.push({ id: OUTPUT_COL, header: 'Output', kind: 'meta' })
  return cols
}
