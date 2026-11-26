import type { ColumnGroup, TruthTable } from '../../core/logic'
import { TRUTH_HINT, truthCellKey } from '../../core/logic'
import { AnswerCell } from '../study/AnswerCell'
import { TABLE, TD, TH, THEAD } from '../ui/tableStyles'
import type { TruthStudy } from './useTruthStudy'

const GROUP_LABEL: Record<ColumnGroup, string> = { input: 'Inputs', intermediate: 'Intermediate', output: 'Outputs' }
// A heavier left edge where a column group starts, as in mark schemes.
const GROUP_EDGE = 'border-l-2 border-l-slate-500 dark:border-l-slate-400'

export function TruthTableView({ table, study }: { table: TruthTable; study?: TruthStudy }) {
  const { columns, rows } = table
  const grid = study?.active ? study.grid : null
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
      <table aria-label="Truth table" className={`${TABLE} w-auto`} onKeyDown={grid?.onKeyDown}>
        <caption className="sr-only">Truth table: every combination of the inputs and the value of each column</caption>
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
              {r.cells.map((cell, i) => {
                const col = columns[i]!
                const key = truthCellKey(r.index, col.key)
                const asked = !!grid && !!study?.masked.has(key)
                const Cell = i === 0 && col.group === 'input' && !asked ? 'th' : 'td'
                return (
                  <Cell
                    key={col.key}
                    scope={Cell === 'th' ? 'row' : undefined}
                    className={`${TD} text-center [font-weight:inherit] ${edge(i)}`}
                  >
                    {asked && grid && study ? (
                      <AnswerCell
                        cellKey={key}
                        colId={col.key}
                        label={`Row ${r.index + 1}, ${col.label}`}
                        answer={grid.answers[key] ?? ''}
                        grade={grid.graded?.[key]}
                        revealed={!!grid.revealed[key]}
                        truthText={cell}
                        hint={grid.hints[key] ? TRUTH_HINT : null}
                        onAnswer={(text) => grid.setAnswer(key, text)}
                        onReveal={() => grid.reveal(key)}
                        onHint={() => grid.toggleHint(key)}
                      />
                    ) : (
                      cell
                    )}
                  </Cell>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
