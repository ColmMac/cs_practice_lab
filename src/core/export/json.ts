import { SITE_NAME } from '../../config/site'
import type { DisplayStyle, Granularity } from '../derive/rows'
import type { TraceResult } from '../types'
import type { ExportVariant, TableModel } from './tableModel'

export const JSON_SCHEMA = 'trace-table/v1'

export interface JsonExportInput {
  result: TraceResult
  code: string
  stdin: string[]
  language: string
  granularity: Granularity
  display: DisplayStyle
  variant: ExportVariant
  table: TableModel
}

/**
 * Full-fidelity export: the source, the view that produced the visible table, that table, and the complete
 * recorded trace (every step with all variables), so nothing is lost and it can be re-imported later.
 */
export function toJson(i: JsonExportInput): string {
  return (
    JSON.stringify(
      {
        schema: JSON_SCHEMA,
        generator: SITE_NAME,
        source: { language: i.language, code: i.code, stdin: i.stdin },
        view: {
          granularity: i.granularity,
          display: i.display,
          variant: i.variant,
          columns: i.table.columns.map((c) => c.id),
        },
        table: { columns: i.table.columns, rows: i.table.rows },
        result: i.result,
      },
      null,
      2,
    ) + '\n'
  )
}
