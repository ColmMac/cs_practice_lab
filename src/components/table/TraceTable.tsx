import { useMemo, type KeyboardEvent } from 'react'
import { columnLabel, LINE_COL, OUTPUT_COL } from '../../core/derive/columns'
import { deriveRows } from '../../core/derive/rows'
import { hintFor } from '../../core/study/hint'
import { cellKey } from '../../core/study/types'
import type { TraceResult } from '../../core/types'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { focusInput, nextStudyInput } from '../study/navigation'
import { StudyCell } from '../study/StudyCell'
import { useStudyModel } from '../study/useStudyModel'
import { useColumns } from './useColumns'

const th = 'border border-slate-300 px-3 py-1.5 text-left font-semibold dark:border-slate-700'
const td = 'border border-slate-300 px-3 py-1 font-mono dark:border-slate-700'

export function TraceTable({ result, stale }: { result: TraceResult; stale: boolean }) {
  const { granularity, displayStyle, selectedStep, hoverStep, setHoverStep, selectStep } = useStore()
  const { setAnswer, revealCell, toggleHint, selectStepExclusive } = useStore()
  const study = useStore((s) => s.study)
  const format = getLanguage(result.language).formatValue
  const { visible } = useColumns(result)
  const model = useStudyModel(result)

  // In a study session the table is FROZEN: it uses the columns/modes captured when the session began.
  const columns = study ? study.columns : visible
  const rows = useMemo(
    () => model?.rows ?? deriveRows(result, columns, format, { granularity, display: displayStyle }),
    [model, result, columns, format, granularity, displayStyle],
  )
  const questions = useMemo(() => new Map((model?.cells ?? []).map((c) => [c.key, c])), [model])

  if (result.steps.length === 0) return null

  const groups: { label: string; span: number }[] = []
  for (const c of columns) {
    const label = c.kind === 'var' ? (c.group ?? '') : ''
    const last = groups[groups.length - 1]
    if (last && last.label === label && label !== '') last.span++
    else groups.push({ label, span: 1 })
  }
  const showGroups = new Set(columns.filter((c) => c.kind === 'var').map((c) => c.group)).size > 1

  /** Enter / ↓ next, Shift+Enter / ↑ previous, Alt+H hint, Alt+R reveal: all from inside an answer box. */
  const onStudyKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || !input.dataset.studyKey || e.ctrlKey || e.metaKey) return
    const key = input.dataset.studyKey
    const table = e.currentTarget

    if (e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      toggleHint(key)
    } else if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      const next = nextStudyInput(table, input, 1)
      revealCell(key) // this box turns into plain text, so move on first
      if (!focusInput(next)) focusInput(table.closest('section')?.querySelector<HTMLElement>('#study-check') ?? null)
    } else if (!e.altKey && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const delta = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1
      const next = nextStudyInput(table, input, delta)
      if (!focusInput(next) && delta > 0) {
        focusInput(document.getElementById('study-check')) // end of the quiz: on to Check answers
      }
    }
  }

  return (
    <div className={`overflow-auto ${stale ? 'opacity-60' : ''}`} aria-busy={stale}>
      {rows.length === 0 && (
        <p className="p-3 text-sm text-slate-600 dark:text-slate-400">
          No rows to show in Compact mode (nothing changed). Switch to “Every line” to see each executed line.
        </p>
      )}
      <table className="w-full border-collapse text-sm" aria-label="Trace table" onKeyDown={study ? onStudyKey : undefined}>
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
                // in study mode Tab should hop from answer to answer, not stop on every row first
                tabIndex={study ? -1 : 0}
                aria-current={selected || undefined}
                data-line={row.lineNumber}
                data-step={step}
                onMouseEnter={() => setHoverStep(step)}
                onMouseLeave={() => setHoverStep(null)}
                onFocus={() => setHoverStep(step)}
                onBlur={() => setHoverStep(null)}
                onClick={() => selectStep(step)}
                onKeyDown={(e) => {
                  // only keys pressed on the ROW itself: Space/Enter typed inside an answer box must reach the box
                  if (e.target !== e.currentTarget) return
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
                  const key = cellKey(step, c.id)
                  const question = study && model?.maskedKeys.has(key) ? questions.get(key) : undefined
                  return (
                    <td
                      key={c.id}
                      title={cell?.note}
                      className={`${td} ${cell?.written ? 'font-bold' : 'text-slate-600 dark:text-slate-400'} ${c.id === OUTPUT_COL ? 'whitespace-pre' : ''}`}
                      style={c.id === LINE_COL ? { paddingLeft: 12 + row.depth * 14 } : undefined}
                    >
                      {question && study ? (
                        <StudyCell
                          cellKey={key}
                          colId={c.id}
                          label={`Row ${row.rowIndex + 1} (line ${row.lineNumber}), ${columnLabel(c)}`}
                          answer={study.answers[key] ?? ''}
                          grade={study.graded?.[key]}
                          revealed={!!study.revealed[key]}
                          truthText={cell?.display ?? ''}
                          hint={study.hints[key] ? hintFor(question.truth) : null}
                          onAnswer={(text) => setAnswer(key, text)}
                          onReveal={() => revealCell(key)}
                          onHint={() => toggleHint(key)}
                          onFocusCell={() => selectStepExclusive(step)}
                        />
                      ) : (
                        cell?.display
                      )}
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
