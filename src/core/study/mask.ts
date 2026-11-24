import { OUTPUT_COL, LINE_COL, STACK_COL } from '../derive/columns'
import type { ColumnDef, TraceRow } from '../types'
import { mulberry32, shuffled } from './rng'
import { cellKey, type StudyConfig, type Truth } from './types'

export interface MaskableCell {
  key: string
  stepIndex: number
  rowIndex: number
  colId: string
  truth: Truth
}

/**
 * Cells a student can be asked to predict: the ones the program WRITES on that row (a variable assigned or
 * changed, a return value, printed output). Cells that merely carry an old value forward are context, not
 * questions. The Line and Call stack columns are never asked, and neither are watch cells that failed.
 */
export function maskableCells(rows: TraceRow[], columns: ColumnDef[]): MaskableCell[] {
  const out: MaskableCell[] = []
  for (const row of rows) {
    const stepIndex = row.stepIndices[0]!
    for (const col of columns) {
      if (col.id === LINE_COL || col.id === STACK_COL) continue
      const cell = row.cells[col.id]
      if (!cell?.written) continue
      let truth: Truth
      if (col.id === OUTPUT_COL) truth = { kind: 'output', text: cell.display }
      else if (cell.value !== undefined) truth = { kind: 'value', value: cell.value }
      else continue
      out.push({ key: cellKey(stepIndex, col.id), stepIndex, rowIndex: row.rowIndex, colId: col.id, truth })
    }
  }
  return out
}

/** Which of the maskable cells are hidden. Deterministic for a given (config, seed). */
export function selectMasks(cells: MaskableCell[], config: StudyConfig, seed: number): Set<string> {
  if (config.outputOnly) return new Set(cells.filter((c) => c.colId === OUTPUT_COL).map((c) => c.key))

  switch (config.maskMode) {
    case 'all':
      return new Set(cells.map((c) => c.key))
    case 'columns': {
      const chosen = new Set(config.columns)
      return new Set(cells.filter((c) => chosen.has(c.colId)).map((c) => c.key))
    }
    case 'random': {
      const percent = Math.min(100, Math.max(0, Math.round(config.percent)))
      if (cells.length === 0 || percent === 0) return new Set()
      // exact count (not a coin flip per cell), at least one when asked for something
      const count = Math.max(1, Math.round((cells.length * percent) / 100))
      return new Set(shuffled(cells, mulberry32(seed)).slice(0, count).map((c) => c.key))
    }
  }
}
