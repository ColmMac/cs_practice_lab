import type { ColumnGroup, TruthTable } from '../../core/logic'
import { TABLE, TD, TH, THEAD } from '../ui/tableStyles'

const GROUP_LABEL: Record<ColumnGroup, string> = { input: 'Inputs', intermediate: 'Intermediate', output: 'Outputs' }
// A heavier left edge where a column group starts, as in mark schemes.
const GROUP_EDGE = 'border-l-2 border-l-slate-500 dark:border-l-slate-400'

export function TruthTableView({ table }: { table: TruthTable }) {
  const { columns, rows } = table
  const edge = (i: number) => (i > 0 && columns[i]!.group !== columns[i - 1]!.group ? GROUP_EDGE : '')

  // Consecutive columns of one group share a spanning header cell.
  const groups: { group: ColumnGroup; span: number; start: number }[] = []
  columns.forEach((c, i) => {
    const last = groups[groups.length - 1]
    if (last && last.group === c.group) last.span++
    else groups.push({ group: c.group, span: 1, start: i })
  })

  return (
    <div className="overflow-auto">
      <table aria-label="Truth table" className={`${TABLE} w-auto`}>
        <thead className={THEAD}>
          <tr>
            {groups.map((g) => (
              <th key={g.start} colSpan={g.span} scope="colgroup" className={`${TH} text-center text-xs ${edge(g.start)}`}>
                {GROUP_LABEL[g.group]}
              </th>
            ))}
          </tr>
          <tr>
            {columns.map((c, i) => (
              <th key={c.key} scope="col" className={`${TH} font-mono ${edge(i)}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.index}>
              {r.cells.map((cell, i) => (
                <td key={columns[i]!.key} className={`${TD} text-center ${edge(i)}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
