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
    // A tab stop, so a keyboard can scroll a long history or a wide row
    <div tabIndex={0} role="group" aria-label="History scroll area" className="max-h-80 overflow-auto focus-visible:outline-2 focus-visible:outline-accent">
      <table className={`${TABLE} w-auto`}>
        <caption className="sr-only">{table.title}</caption>
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
                {r.cells.map((cell, j) => {
                  // the first column is the pass (or probe) number: it names the row
                  const Cell = j === 0 ? 'th' : 'td'
                  return (
                    <Cell
                      key={j}
                      scope={j === 0 ? 'row' : undefined}
                      className={j === 0 ? `${TD} text-left [font-weight:inherit]` : TD}
                    >
                      {cell}
                    </Cell>
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
