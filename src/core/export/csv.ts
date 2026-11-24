import type { TableModel } from './tableModel'

const PLAIN_NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/

/**
 * Spreadsheets run a cell that starts with = + - @ (or a tab / carriage return) as a FORMULA. A program that
 * prints `=1+1` (or a student string, or a watch label) would then execute in Excel, so such cells get a
 * leading apostrophe, the standard defence. Genuine numbers like -5 are left alone.
 */
export function neutraliseFormula(text: string): string {
  return /^[=+\-@\t\r]/.test(text) && !PLAIN_NUMBER.test(text) ? `'${text}` : text
}

/** RFC 4180 field: quoted when it holds a quote, comma, newline, or leading/trailing space. */
function field(text: string): string {
  const t = neutraliseFormula(text)
  return /["\n\r,]|^\s|\s$/.test(t) ? `"${t.replaceAll('"', '""')}"` : t
}

/** UTF-8 byte order mark: makes Excel read accents and symbols correctly. Added to downloads, not to copied text. */
export const CSV_BOM = '﻿'

export function toCsv(m: TableModel): string {
  const lines = [m.columns.map((c) => field(c.header)), ...m.rows.map((r) => r.map(field))]
  return lines.map((l) => l.join(',')).join('\r\n') + '\r\n'
}
