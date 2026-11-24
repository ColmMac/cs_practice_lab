import type { Grade } from '../../core/study/types'

interface Props {
  /** `${stepIndex}:${columnId}`; also what keyboard navigation groups by column */
  cellKey: string
  colId: string
  label: string
  answer: string
  grade?: Grade
  revealed: boolean
  /** the ground truth, shown only once revealed */
  truthText: string
  hint: string | null
  onAnswer: (text: string) => void
  onReveal: () => void
  onHint: () => void
  onFocusCell?: () => void
}

const ICON = { correct: '✓', close: '≈', incorrect: '✗' } as const
const WORD = { correct: 'Correct', close: 'Almost', incorrect: 'Not correct' } as const
const TONE = {
  correct: 'border-emerald-600 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/60 dark:text-emerald-100',
  close: 'border-amber-600 bg-amber-50 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100',
  incorrect: 'border-red-600 bg-red-50 text-red-950 dark:bg-red-950/60 dark:text-red-100',
} as const
const NEUTRAL = 'border-slate-400 bg-white text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100'

const iconBtn =
  'rounded border border-slate-300 px-1 text-[11px] leading-5 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'

/** One masked cell (tool-agnostic): a text box for the student's prediction, with Hint / Reveal and per-cell feedback after checking. */
export function AnswerCell({ cellKey, colId, label, answer, grade, revealed, truthText, hint, onAnswer, onReveal, onHint, onFocusCell }: Props) {
  if (revealed) {
    return (
      <div className="flex items-center gap-2" data-testid="revealed-cell">
        <span className="font-bold whitespace-pre">{truthText}</span>
        <span className="rounded bg-slate-200 px-1 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-200">revealed</span>
      </div>
    )
  }

  const msgId = `study-msg-${cellKey}`
  const described = grade || hint ? msgId : undefined
  return (
    <div className="flex min-w-[6rem] flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
          onFocus={onFocusCell}
          onClick={(e) => e.stopPropagation()}
          data-study-key={cellKey}
          data-study-col={colId}
          aria-label={label}
          aria-invalid={grade?.state === 'incorrect' ? true : undefined}
          aria-describedby={described}
          aria-keyshortcuts="Alt+H Alt+R"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={`min-w-0 flex-1 rounded border px-1.5 py-0.5 font-mono text-sm ${grade ? TONE[grade.state] : NEUTRAL}`}
        />
        <button
          type="button"
          tabIndex={-1}
          className={iconBtn}
          aria-label={`Hint for ${label}`}
          title="Hint (Alt+H)"
          onClick={(e) => {
            e.stopPropagation()
            onHint()
          }}
        >
          ?
        </button>
        <button
          type="button"
          tabIndex={-1}
          className={iconBtn}
          aria-label={`Reveal ${label}`}
          title="Reveal the answer (Alt+R); it won’t count towards your score"
          onClick={(e) => {
            e.stopPropagation()
            onReveal()
          }}
        >
          👁
        </button>
      </div>
      {(grade || hint) && (
        <span id={msgId} className="text-[11px] leading-tight font-sans">
          {grade && (
            <span className="font-semibold">
              <span aria-hidden="true">{ICON[grade.state]} </span>
              {WORD[grade.state]}
              {grade.message && grade.state !== 'correct' ? ` — ${grade.message}` : ''}
            </span>
          )}
          {grade && hint ? ' · ' : ''}
          {hint && <span className="text-slate-600 dark:text-slate-400">Hint: {hint}</span>}
        </span>
      )}
    </div>
  )
}
