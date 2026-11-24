import { useEffect, useRef } from 'react'
import { currentHistoryRow, type HistoryTable as History } from '../../core/algorithms'
import { TABLE, TD, TH, THEAD } from '../ui/tableStyles'

const CURRENT = 'bg-amber-100 font-semibold dark:bg-amber-900/40'

/** The pass-by-pass table, with the row that matches the visualiser's current step highlighted. */
export function HistoryTable({ table, frame }: { table: History; frame: number }) {
  const current = currentHistoryRow(table, frame)
  const row = useRef<HTMLTableRowElement | null>(null)

  useEffect(() => {
    row.current?.scrollIntoView?.({ block: 'nearest' })
  }, [current])

  return (
    <div className="max-h-80 overflow-auto">
      <table aria-label={table.title} className={`${TABLE} w-auto`}>
        <thead className={THEAD}>
          <tr>
            <th scope="col" className={`${TH} w-6`}>
              <span className="sr-only">Current</span>
            </th>
            {table.columns.map((c) => (
              <th key={c.id} scope="col" className={`${TH} font-mono`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => {
            const isCurrent = i === current
            return (
              <tr key={i} ref={isCurrent ? row : undefined} aria-current={isCurrent ? 'step' : undefined} className={isCurrent ? CURRENT : undefined}>
                <td className={`${TD} text-center`} aria-hidden="true">
                  {isCurrent ? '▶' : ''}
                </td>
                {r.cells.map((cell, j) => (
                  <td key={j} className={TD}>
                    {cell}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
