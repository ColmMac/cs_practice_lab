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
  /** Program inputs, shown under the program on a printed worksheet. */
  inputs?: string[]
}

export interface BuildOptions {
  variant: ExportVariant
  /** Cell keys (see `cellKey`) that are blank in the worksheet. */
  masked?: ReadonlySet<string>
  includeCode?: boolean
  code?: string
  codeLanguage?: string
  /** Blank EVERY cell, line numbers included (the printed exam grid). */
  blankAll?: boolean
  /** Empty rows added after the last one. */
  extraRows?: number
}

export function buildTableModel(columns: ColumnDef[], rows: TraceRow[], opts: BuildOptions): TableModel {
  const worksheet = opts.variant === 'worksheet'
  return {
    title: worksheet ? 'Trace table (worksheet)' : 'Trace table',
    variant: opts.variant,
    columns: columns.map((c) => ({ id: c.id, header: columnLabel(c) })),
    rows: [
      ...rows.map((row) => {
        const step = row.stepIndices[0]!
        return columns.map((c) =>
          opts.blankAll || (worksheet && opts.masked?.has(cellKey(step, c.id))) ? '' : (row.cells[c.id]?.display ?? ''),
        )
      }),
      ...Array.from({ length: opts.extraRows ?? 0 }, () => columns.map(() => '')),
    ],
    ...(opts.includeCode && opts.code ? { code: opts.code.replace(/\s+$/, ''), codeLanguage: opts.codeLanguage } : {}),
  }
}

/** Spare rows on the student's grid, so its length doesn't give the number of rows away exactly. */
export const PACK_SPARE_ROWS = 2

export interface PackOptions {
  /** The study mask, used only when `useStudyBlanks` is set. */
  masked: ReadonlySet<string>
  /** Leave the unmasked cells filled in. Ignored when the mask is empty: that would print the answers. */
  useStudyBlanks: boolean
  code: string
  codeLanguage?: string
  inputs?: string[]
}

export interface PrintPackModel {
  worksheet: TableModel
  key: TableModel
}

/** The two parts of "Print worksheet + answer key": the student's grid (with the program) and the mark scheme. */
export function buildPrintPack(columns: ColumnDef[], rows: TraceRow[], opts: PackOptions): PrintPackModel {
  const worksheet = buildTableModel(columns, rows, {
    variant: 'worksheet',
    masked: opts.masked,
    blankAll: !(opts.useStudyBlanks && opts.masked.size > 0),
    extraRows: PACK_SPARE_ROWS,
    includeCode: true,
    code: opts.code,
    codeLanguage: opts.codeLanguage,
  })
  return {
    worksheet: opts.inputs?.length ? { ...worksheet, inputs: opts.inputs } : worksheet,
    key: { ...buildTableModel(columns, rows, { variant: 'key' }), title: 'Mark scheme' },
  }
}

/** The longest line in each column's cells (the header not counted), in characters. */
export function valueWidths(m: TableModel): number[] {
  return m.columns.map((_, j) => {
    let widest = 0
    for (const row of m.rows) for (const line of (row[j] ?? '').split('\n')) widest = Math.max(widest, line.length)
    return widest
  })
}

/**
 * A header as the lines it may be stacked on. `binary_find.target` splits after the dot when that is what makes its
 * column wide: the header is much longer than anything under it.
 */
export function headerParts(header: string, valueWidth: number): string[] {
  const dot = header.lastIndexOf('.')
  const worthIt = header.length > Math.max(valueWidth, 8) && dot > 0 && dot < header.length - 1
  return worthIt ? [header.slice(0, dot + 1), header.slice(dot + 1)] : [header]
}

/** Safe base name for downloads: `trace-table`, `trace-table-worksheet`. */
export const exportBaseName = (variant: ExportVariant): string => (variant === 'worksheet' ? 'trace-table-worksheet' : 'trace-table')
