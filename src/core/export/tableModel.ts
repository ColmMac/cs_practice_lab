import { columnLabel } from '../derive/columns'
import { cellKey } from '../study/types'
import type { ColumnDef, TraceRow } from '../types'

/**
 * answer key  — the table as it is.
 * worksheet   — the cells a student is meant to fill in are left blank (the study mask).
 */
export type ExportVariant = 'key' | 'worksheet'

/** What every exporter works from: plain strings, already filtered and formatted exactly as shown on screen. */
export interface TableModel {
  title: string
  variant: ExportVariant
  columns: { id: string; header: string }[]
  rows: string[][]
  /** The program, when the user asked for it to be included. */
  code?: string
  /** Language id for fenced code blocks. */
  codeLanguage?: string
}

export interface BuildOptions {
  variant: ExportVariant
  /** Cell keys (see `cellKey`) that are blank in the worksheet. */
  masked?: ReadonlySet<string>
  includeCode?: boolean
  code?: string
  codeLanguage?: string
}

export function buildTableModel(columns: ColumnDef[], rows: TraceRow[], opts: BuildOptions): TableModel {
  const worksheet = opts.variant === 'worksheet'
  return {
    title: worksheet ? 'Trace table (worksheet)' : 'Trace table',
    variant: opts.variant,
    columns: columns.map((c) => ({ id: c.id, header: columnLabel(c) })),
    rows: rows.map((row) => {
      const step = row.stepIndices[0]!
      return columns.map((c) => (worksheet && opts.masked?.has(cellKey(step, c.id)) ? '' : (row.cells[c.id]?.display ?? '')))
    }),
    ...(opts.includeCode && opts.code ? { code: opts.code.replace(/\s+$/, ''), codeLanguage: opts.codeLanguage } : {}),
  }
}

/** Safe base name for downloads: `trace-table`, `trace-table-worksheet`. */
export const exportBaseName = (variant: ExportVariant): string => (variant === 'worksheet' ? 'trace-table-worksheet' : 'trace-table')
