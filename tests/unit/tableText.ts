import type { ColumnDef, TraceRow } from '../../src/core/types'

/** Plain-text rendering of a derived table, for readable golden-file snapshots. */
export function tableText(columns: ColumnDef[], rows: TraceRow[]): string {
  const head = columns.map((c) => (c.kind === 'var' && c.group !== '<module>' ? `${c.group}.${c.header}` : c.header))
  const body = rows.map((r) =>
    columns.map((c) => {
      let d = r.cells[c.id]?.display ?? ''
      // with a Condition column the outcome has its own cell, so the Line suffix is dropped (as the UI drops its chip)
      if (c.id === 'line' && !columns.some((x) => x.id === 'cond')) {
        d = '  '.repeat(r.depth) + d + (r.branch === undefined ? '' : r.branch ? ' T' : ' F')
      } else if (c.id === 'line') {
        d = '  '.repeat(r.depth) + d
      }
      return d.replace(/\n/g, '\\n')
    }),
  )
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i]!.length)))
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join(' | ').trimEnd()
  return [fmt(head), widths.map((w) => '-'.repeat(w)).join('-+-'), ...body.map(fmt)].join('\n') + '\n'
}
