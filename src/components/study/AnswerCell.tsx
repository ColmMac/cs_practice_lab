import type { Explanation } from '../../core/explain/stepExplainer'
import type { Grade } from '../../core/study/types'
import { WhyCallout } from './WhyCallout'
import { Eye } from 'lucide-react'

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
  /** Left out while revealing is locked (a challenge before its first check): no Reveal button. */
  onReveal?: () => void
  onHint: () => void
  onFocusCell?: () => void
  /** Offers "Why?" on a cell graded incorrect; tools without explanations leave it out. */
  onWhy?: () => void
  /** The open explanation. It stays on screen after Reveal (then with the result). */
  why?: Explanation | null
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
export function AnswerCell({ cellKey, colId, label, answer, grade, revealed, truthText, hint, onAnswer, onReveal, onHint, onFocusCell, onWhy, why }: Props) {
  const whyId = `study-why-${cellKey}`
  if (revealed) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2" data-testid="revealed-cell">
          <span className="font-bold whitespace-pre">{truthText}</span>
          <span className="rounded bg-slate-200 px-1 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-200">revealed</span>
        </div>
        {why && <WhyCallout id={whyId} explanation={why} />}
      </div>
    )
  }

  const msgId = `study-msg-${cellKey}`
  const offerWhy = !!onWhy && grade?.state === 'incorrect'
  const open = offerWhy && !!why
  const described = [grade || hint ? msgId : '', open ? whyId : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="flex min-w-[6rem] flex-col gap-0.5">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
          onFocus={(e) => {
            // honours the scroll margin, so the box doesn't sit under a sticky table header (Tab and Shift+Tab too)
            e.currentTarget.scrollIntoView?.({ block: 'nearest' })
            onFocusCell?.()
          }}
          onClick={(e) => e.stopPropagation()}
          data-study-key={cellKey}
          data-study-col={colId}
          aria-label={label}
          aria-invalid={grade?.state === 'incorrect' ? true : undefined}
          aria-describedby={described}
          aria-keyshortcuts={['Alt+H', onReveal && 'Alt+R', onWhy && 'Alt+W'].filter(Boolean).join(' ')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={`min-w-0 flex-1 scroll-mt-[var(--study-head,0px)] rounded border px-1.5 py-0.5 font-mono text-sm projector:text-[1.18rem] ${grade ? TONE[grade.state] : NEUTRAL}`}
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
        {onReveal && (
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
            <Eye aria-hidden="true" className="inline-block size-3 align-[-0.125em]" />
          </button>
        )}
      </div>
      {(grade || hint) && (
        <span id={msgId} className="text-[11px] leading-tight font-sans projector:text-sm">
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
      {offerWhy && (
        <button
          type="button"
          tabIndex={-1}
          className={`${iconBtn} self-start font-sans`}
          aria-label={`Why? Explain ${label}`}
          aria-expanded={open}
          title="Show the working, without the answer (Alt+W)"
          onClick={(e) => {
            e.stopPropagation()
            onWhy()
          }}
        >
          Why?
        </button>
      )}
      {/* the live region exists before the text arrives, so opening it with Alt+W is announced */}
      {onWhy && <div aria-live="polite">{open && why && <WhyCallout id={whyId} explanation={why} />}</div>}
    </div>
  )
}
