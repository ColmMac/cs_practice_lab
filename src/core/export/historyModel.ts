import type { HistoryTable } from '../algorithms/history'
import type { TableModel } from './tableModel'

/** The pass-by-pass table as the shared export model: strings exactly as shown. */
export function buildHistoryModel(table: HistoryTable): TableModel {
  return {
    title: table.title,
    variant: 'key',
    columns: table.columns,
    rows: table.rows.map((r) => r.cells),
  }
}

/** `bubble-sort-passes`, `binary-search-probes`. */
export const historyBaseName = (table: HistoryTable): string => {
  const name = { bubble: 'bubble-sort', insertion: 'insertion-sort', merge: 'merge-sort', linear: 'linear-search', binary: 'binary-search' }[table.algo]
  return `${name}-${table.kind === 'pass' ? 'passes' : 'probes'}`
}
