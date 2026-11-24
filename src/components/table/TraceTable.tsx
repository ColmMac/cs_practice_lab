import { useMemo } from 'react'
import { deriveColumns, LINE_COL, OUTPUT_COL } from '../../core/derive/columns'
import { deriveRows } from '../../core/derive/rows'
import type { TraceResult } from '../../core/types'
import { getLanguage } from '../../languages/registry'

const th = 'border border-slate-300 px-3 py-1.5 text-left font-semibold dark:border-slate-700'
const td = 'border border-slate-300 px-3 py-1 font-mono dark:border-slate-700'

export function TraceTable({ result, stale }: { result: TraceResult; stale: boolean }) {
  const format = getLanguage(result.language).formatValue
  const columns = useMemo(() => deriveColumns(result), [result])
  const rows = useMemo(() => deriveRows(result, columns, format), [result, columns, format])

  if (result.steps.length === 0) return null

  const groups: { label: string; span: number }[] = []
  for (const c of columns) {
    const label = c.kind === 'var' ? (c.group ?? '') : ''
    const last = groups[groups.length - 1]
    if (last && last.label === label && label !== '') last.span++
    else groups.push({ label, span: 1 })
  }
  const showGroups = new Set(columns.filter((c) => c.kind === 'var').map((c) => c.group)).size > 1

  return (
    <div className={`overflow-auto ${stale ? 'opacity-60' : ''}`} aria-busy={stale}>
      <table className="w-full border-collapse text-sm" aria-label="Trace table">
        <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
          {showGroups && (
            <tr>
              {groups.map((g, i) => (
                <th key={i} colSpan={g.span} className={`${th} text-center text-xs text-slate-600 dark:text-slate-400`}>
                  {g.label}
                </th>
              ))}
            </tr>
          )}
          <tr>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={th}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.rowIndex} className="odd:bg-white even:bg-slate-50 dark:odd:bg-slate-950 dark:even:bg-slate-900">
              {columns.map((c) => {
                const cell = row.cells[c.id]
                const written = cell?.written
                return (
                  <td
                    key={c.id}
                    className={`${td} ${written ? 'bg-amber-100 font-bold dark:bg-amber-900/40' : 'text-slate-600 dark:text-slate-400'} ${c.id === OUTPUT_COL ? 'whitespace-pre' : ''}`}
                    style={c.id === LINE_COL ? { paddingLeft: 12 + row.depth * 14 } : undefined}
                  >
                    {cell?.display}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
