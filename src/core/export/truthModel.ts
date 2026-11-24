import { truthCellKey, type TruthTable } from '../logic'
import type { ExportVariant, TableModel } from './tableModel'

export interface TruthExportOptions {
  variant: ExportVariant
  /** Cell keys (see `truthCellKey`) that are blank in the worksheet. */
  masked?: ReadonlySet<string>
  /** The expression as typed; included as a code block when `includeCode` is set. */
  expression?: string
  includeCode?: boolean
}

/** A truth table as the shared export model: strings exactly as shown, masked cells blank in a worksheet. */
export function buildTruthTableModel(table: TruthTable, opts: TruthExportOptions): TableModel {
  const worksheet = opts.variant === 'worksheet'
  const code = opts.expression?.replace(/\s+$/, '')
  return {
    title: worksheet ? 'Truth table (worksheet)' : 'Truth table',
    variant: opts.variant,
    columns: table.columns.map((c) => ({ id: c.key, header: c.label })),
    rows: table.rows.map((r) =>
      r.cells.map((text, i) => (worksheet && opts.masked?.has(truthCellKey(r.index, table.columns[i]!.key)) ? '' : text)),
    ),
    ...(opts.includeCode && code ? { code, codeLanguage: 'text' } : {}),
  }
}

/** `truth-table`, `truth-table-worksheet`. */
export const truthBaseName = (variant: ExportVariant): string => (variant === 'worksheet' ? 'truth-table-worksheet' : 'truth-table')
