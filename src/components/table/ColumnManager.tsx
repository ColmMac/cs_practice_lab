import { useEffect, useId, useRef, useState } from 'react'
import { columnLabel, moveColumn } from '../../core/derive/columns'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { useColumns } from './useColumns'

const label = columnLabel
const btn =
  'rounded border border-slate-300 px-1.5 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-30 dark:border-slate-700 dark:hover:bg-slate-800'

/** Popover for choosing which columns the table shows, and in what order. */
export function ColumnManager({ result }: { result: TraceResult }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const { all, visible } = useColumns(result)
  const { hiddenColumns, toggleColumn, setColumnOrder, resetColumns, showEphemeral, setShowEphemeral, showCallables, setShowCallables } =
    useStore()

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const movable = all.filter((c) => c.kind === 'var' || c.kind === 'watch').map((c) => c.id)
  const move = (id: string, delta: -1 | 1) => setColumnOrder(moveColumn(movable, id, delta))

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
        className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
      >
        Columns ({visible.length}/{all.length}) ▾
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Columns"
          className="absolute left-0 z-30 mt-1 w-72 rounded border border-slate-300 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <ul className="max-h-64 space-y-1 overflow-auto">
            {all.map((c) => {
              const canMove = c.kind === 'var' || c.kind === 'watch'
              const at = movable.indexOf(c.id)
              return (
                <li key={c.id} className="flex items-center gap-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input type="checkbox" checked={!hiddenColumns.includes(c.id)} onChange={() => toggleColumn(c.id)} />
                    <span className="truncate font-mono text-xs" title={label(c)}>
                      {label(c)}
                    </span>
                  </label>
                  {canMove && (
                    <span className="flex gap-1">
                      <button type="button" className={btn} aria-label={`Move ${label(c)} left`} disabled={at <= 0} onClick={() => move(c.id, -1)}>
                        ↑
                      </button>
                      <button
                        type="button"
                        className={btn}
                        aria-label={`Move ${label(c)} right`}
                        disabled={at < 0 || at >= movable.length - 1}
                        onClick={() => move(c.id, 1)}
                      >
                        ↓
                      </button>
                    </span>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="mt-3 space-y-1.5 border-t border-slate-200 pt-3 dark:border-slate-700">
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={showEphemeral} onChange={(e) => setShowEphemeral(e.target.checked)} className="mt-0.5" />
              <span>Show temporary variables <span className="text-xs text-slate-500">(loop variables inside comprehensions)</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="checkbox" checked={showCallables} onChange={(e) => setShowCallables(e.target.checked)} className="mt-0.5" />
              <span>Show functions &amp; modules <span className="text-xs text-slate-500">(runs the program again)</span></span>
            </label>
            <button type="button" className={`${btn} mt-1 px-2 py-1`} onClick={resetColumns}>
              Reset columns
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
