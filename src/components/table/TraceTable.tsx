import { useMemo } from 'react'
import { deriveColumns, LINE_COL, OUTPUT_COL } from '../../core/derive/columns'
import { deriveRows } from '../../core/derive/rows'
import type { TraceResult } from '../../core/types'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'

const th = 'border border-slate-300 px-3 py-1.5 text-left font-semibold dark:border-slate-700'
const td = 'border border-slate-300 px-3 py-1 font-mono dark:border-slate-700'

export function TraceTable({ result, stale }: { result: TraceResult; stale: boolean }) {
  const { granularity, displayStyle, selectedStep, hoverStep, setHoverStep, selectStep } = useStore()
  const format = getLanguage(result.language).formatValue
  const columns = useMemo(() => deriveColumns(result), [result])
  const rows = useMemo(
    () => deriveRows(result, columns, format, { granularity, display: displayStyle }),
    [result, columns, format, granularity, displayStyle],
  )

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
      {rows.length === 0 && (
        <p className="p-3 text-sm text-slate-600 dark:text-slate-400">
          No rows to show in Compact mode (nothing changed). Switch to “Every line” to see each executed line.
        </p>
      )}
      <table className="w-full border-collapse text-sm" aria-label="Trace table">
        <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800">
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
          {rows.map((row) => {
            const step = row.stepIndices[0]!
            const selected = selectedStep !== null && row.stepIndices.includes(selectedStep)
            const hovered = hoverStep !== null && row.stepIndices.includes(hoverStep)
            return (
              <tr
                key={row.rowIndex}
                tabIndex={0}
                aria-current={selected || undefined}
                data-line={row.lineNumber}
                data-step={step}
                onMouseEnter={() => setHoverStep(step)}
                onMouseLeave={() => setHoverStep(null)}
                onFocus={() => setHoverStep(step)}
                onBlur={() => setHoverStep(null)}
                onClick={() => selectStep(step)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    selectStep(step)
                  }
                }}
                className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 ${
                  selected
                    ? 'bg-yellow-200 dark:bg-yellow-900/50'
                    : hovered
                      ? 'bg-yellow-100 dark:bg-yellow-900/25'
                      : 'odd:bg-white even:bg-slate-50 dark:odd:bg-slate-950 dark:even:bg-slate-900'
                }`}
              >
                {columns.map((c) => {
                  const cell = row.cells[c.id]
                  return (
                    <td
                      key={c.id}
                      className={`${td} ${cell?.written ? 'font-bold' : 'text-slate-600 dark:text-slate-400'} ${c.id === OUTPUT_COL ? 'whitespace-pre' : ''}`}
                      style={c.id === LINE_COL ? { paddingLeft: 12 + row.depth * 14 } : undefined}
                    >
                      {cell?.display}
                      {c.id === LINE_COL && row.branch !== undefined && (
                        <span
                          title={row.branch ? 'Condition was true: entered the body' : 'Condition was false'}
                          aria-label={row.branch ? 'condition true' : 'condition false'}
                          className={`ml-2 rounded px-1 text-[10px] font-semibold ${
                            row.branch
                              ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-200'
                              : 'bg-rose-100 text-rose-900 dark:bg-rose-900/50 dark:text-rose-200'
                          }`}
                        >
                          {row.branch ? 'T' : 'F'}
                        </span>
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
