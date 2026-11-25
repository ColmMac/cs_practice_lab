import { useMemo } from 'react'
import { columnLabel, CONDITION_COL, LINE_COL, OUTPUT_COL } from '../../core/derive/columns'
import { explainCell, maskedValueGuard, type ExplainContext } from '../../core/explain/stepExplainer'
import { hintFor } from '../../core/study/hint'
import { cellKey, MAX_MASK_CELLS } from '../../core/study/types'
import type { TraceResult } from '../../core/types'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { TABLE, TD as td, TH as th, THEAD } from '../ui/tableStyles'
import { AnswerCell } from '../study/AnswerCell'
import { answerGridKeyDown } from '../study/useAnswerGrid'
import { HEADER_HEIGHT, useSizeVariable } from './useSizeVariable'
import { useRowWindow, VIRTUALISE_ABOVE } from './useRowWindow'
import { useTableData } from './useTableData'

/** From the back of a room a tint is not enough: the selected row also gets the editor's 4 px bar. */
const PROJECTOR_SELECTED_BAR =
  'projector:[&>td:first-child]:shadow-[inset_4px_0_0_var(--color-amber-700)] dark:projector:[&>td:first-child]:shadow-[inset_4px_0_0_var(--color-amber-500)]'

export function TraceTable({ result, stale }: { result: TraceResult; stale: boolean }) {
  const { selectedStep, hoverStep, setHoverStep, selectStep } = useStore()
  const { setAnswer, revealCell, toggleHint, toggleWhy, selectStepExclusive, toggleCellMask } = useStore()
  const revealLocked = useStore((s) => s.challenge !== null && !s.challenge.checkedOnce)
  // hand-picking cells is the author's job: never offered to a student taking a challenge
  const inChallenge = useStore((s) => s.challenge !== null)
  const study = useStore((s) => s.study)
  // In a study session the table is FROZEN: useTableData returns the columns/modes captured when it began.
  const { columns, rows, model } = useTableData(result)
  const questions = useMemo(() => new Map((model?.cells ?? []).map((c) => [c.key, c])), [model])
  // Long traces render only the rows near the viewport. Study mode renders them all (keyboard navigation needs the boxes).
  const { view: win, refs: { body: bodyRef, row: rowRef } } = useRowWindow(rows.length, !study && rows.length > VIRTUALISE_ABOVE)

  // the sticky header's height, as a CSS variable the answer boxes use as their scroll margin
  const headRef = useSizeVariable(HEADER_HEIGHT)

  if (result.steps.length === 0) return null

  const groups: { label: string; span: number }[] = []
  for (const c of columns) {
    const label = c.kind === 'var' ? (c.group ?? '') : ''
    const last = groups[groups.length - 1]
    if (last && last.label === label && label !== '') last.span++
    else groups.push({ label, span: 1 })
  }
  const showGroups = new Set(columns.filter((c) => c.kind === 'var').map((c) => c.group)).size > 1
  const headerRows = showGroups ? 2 : 1
  // With the Condition column on, the Line cell's T/F chip would repeat it (and, in Study mode, answer it).
  const showChip = !columns.some((c) => c.id === CONDITION_COL)
  const spacer = (height: number) =>
    height > 0 ? (
      <tr aria-hidden="true" style={{ height }}>
        <td colSpan={columns.length} style={{ padding: 0, border: 0 }} />
      </tr>
    ) : null

  /** Enter / ↓ next, Shift+Enter / ↑ previous, Alt+H hint, Alt+R reveal, Alt+W why. */
  const onStudyKey = answerGridKeyDown({ onHint: toggleHint, onReveal: revealLocked ? undefined : revealCell, onWhy: toggleWhy })

  const picking = !!study && !inChallenge && study.config.maskMode === 'cells' && !study.config.outputOnly
  const picksFull = picking && study.config.cells.length >= MAX_MASK_CELLS

  // built only while an explanation is open
  const explain: ExplainContext | null =
    study && model && Object.keys(study.why).length > 0
      ? {
          result,
          format: getLanguage(result.language).formatValue,
          isHidden: maskedValueGuard(
            result,
            model.maskedKeys,
            (k) => !!study.revealed[k] || study.graded?.[k]?.state === 'correct',
          ),
          watchText: (id) => columns.find((c) => c.id === id)?.header ?? id,
        }
      : null

  return (
    // not a scroll container itself: that would stop the header sticking. The pane around it scrolls both ways.
    <div className={stale ? 'opacity-60' : ''} aria-busy={stale}>
      {rows.length === 0 && (
        <p className="p-3 text-sm text-slate-600 dark:text-slate-400">
          No rows to show in Compact mode (nothing changed). Switch to “Every line” to see each executed line.
        </p>
      )}
      <table
        className={TABLE}
        aria-label="Trace table"
        // a windowed table must still tell assistive technology how long it really is
        aria-rowcount={win.active ? rows.length + headerRows : undefined}
        onKeyDown={study ? onStudyKey : undefined}
      >
        <thead ref={headRef} className={THEAD}>
          {showGroups && (
            <tr>
              {groups.map((g, i) =>
                g.label === '' ? (
                  // columns with no group (Line, Return, Output…): a plain empty cell, not an empty header
                  <td key={i} colSpan={g.span} aria-hidden="true" className={th} />
                ) : (
                  <th key={i} colSpan={g.span} scope="colgroup" className={`${th} text-center text-xs text-slate-600 dark:text-slate-400`}>
                    {g.label}
                  </th>
                ),
              )}
            </tr>
          )}
          <tr>
            {columns.map((c) => (
              <th
                key={c.id}
                scope="col"
                title={c.id === CONDITION_COL ? 'if / while: was the condition true? for: was another item taken?' : undefined}
                className={th}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={bodyRef}>
          {spacer(win.padTop)}
          {(win.indices ?? rows.map((_, i) => i)).map((index) => {
            const row = rows[index]!
            const step = row.stepIndices[0]!
            const selected = selectedStep !== null && row.stepIndices.includes(selectedStep)
            const hovered = hoverStep !== null && row.stepIndices.includes(hoverStep)
            return (
              <tr
                key={row.rowIndex}
                ref={win.active ? rowRef : undefined}
                data-index={index}
                aria-rowindex={win.active ? index + 1 + headerRows : undefined}
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
                className={`cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? `bg-yellow-200 dark:bg-yellow-900/50 ${PROJECTOR_SELECTED_BAR}`
                    : hovered
                      ? 'bg-yellow-100 dark:bg-yellow-900/25'
                      : index % 2 === 0
                        ? 'bg-white dark:bg-slate-950'
                        : 'bg-slate-50 dark:bg-slate-900' // by index, not CSS odd/even: the window slides and CSS parity would flicker
                }`}
              >
                {columns.map((c) => {
                  const cell = row.cells[c.id]
                  const key = cellKey(step, c.id)
                  const question = study && model?.maskedKeys.has(key) ? questions.get(key) : undefined
                  const label = `Row ${row.rowIndex + 1} (line ${row.lineNumber}), ${columnLabel(c)}`
                  return (
                    <td
                      key={c.id}
                      title={cell?.note}
                      className={`${td} ${cell?.written ? 'font-bold' : 'text-slate-600 dark:text-slate-400 projector:text-slate-800 dark:projector:text-slate-200'} ${c.id === OUTPUT_COL ? 'whitespace-pre' : ''}`}
                      style={c.id === LINE_COL ? { paddingLeft: 12 + row.depth * 14 } : undefined}
                    >
                      {question && study ? (
                        <AnswerCell
                          cellKey={key}
                          colId={c.id}
                          label={label}
                          answer={study.answers[key] ?? ''}
                          grade={study.graded?.[key]}
                          revealed={!!study.revealed[key]}
                          truthText={cell?.display ?? ''}
                          hint={study.hints[key] ? hintFor(question.truth) : null}
                          onAnswer={(text) => setAnswer(key, text)}
                          onReveal={revealLocked ? undefined : () => revealCell(key)}
                          onHint={() => toggleHint(key)}
                          onFocusCell={() => selectStepExclusive(step)}
                          onWhy={() => toggleWhy(key)}
                          why={explain && study.why[key] ? explainCell(explain, step, c.id, { withResult: !!study.revealed[key] }) : null}
                        />
                      ) : (
                        cell?.display
                      )}
                      {picking && questions.has(key) && (
                        <button
                          type="button"
                          aria-pressed={!!question}
                          aria-label={`${question ? 'Show' : 'Blank this'}: ${label}`}
                          disabled={!question && picksFull}
                          title={!question && picksFull ? `At most ${MAX_MASK_CELLS} cells can be picked` : undefined}
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleCellMask(key)
                          }}
                          className={`${question ? 'mt-1' : 'ml-2'} block whitespace-nowrap rounded border border-slate-300 px-1 font-sans text-[11px] font-normal text-slate-700 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800`}
                        >
                          {question ? 'Show' : 'Blank this'}
                        </button>
                      )}
                      {c.id === LINE_COL && showChip && row.branch !== undefined && (
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
          {spacer(win.padBottom)}
        </tbody>
      </table>
    </div>
  )
}
