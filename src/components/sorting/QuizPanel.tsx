import { gradeQuiz, type QuizQuestion } from '../../core/algorithms'
import { AnswerCell } from '../study/AnswerCell'
import { ScoreBar } from '../study/ScoreBar'
import { CHECK_ID, useAnswerGrid } from '../study/useAnswerGrid'
import { Button } from '../ui/Button'
import type { Quiz } from './useQuiz'
import { ChevronRight } from 'lucide-react'
import { ICON_AFTER } from '../ui/icons'

/** One question with its own answer grid; keyed by question id so each starts fresh. */
function QuestionView({ q, number, total, onNext }: { q: QuizQuestion; number: number; total: number; onNext: Quiz['next'] }) {
  const grid = useAnswerGrid({ keys: [q.id], grade: (_, text) => gradeQuiz(q, text) })
  const grade = grid.graded?.[q.id]
  const revealed = !!grid.revealed[q.id]
  const done = revealed || !!grade
  const last = number === total

  return (
    <div className="flex flex-col gap-2" onKeyDown={grid.onKeyDown}>
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Question {number} of {total}
      </p>
      <p data-testid="quiz-prompt" className="text-sm">
        {q.prompt}
      </p>
      <div className="max-w-md">
        <AnswerCell
          cellKey={q.id}
          colId={q.kind}
          label={q.kind === 'list' ? 'Your list' : 'Your index'}
          answer={grid.answers[q.id] ?? ''}
          grade={grade}
          revealed={revealed}
          truthText={q.truth}
          hint={grid.hints[q.id] ? q.hint : null}
          onAnswer={(t) => grid.setAnswer(q.id, t)}
          onReveal={() => grid.reveal(q.id)}
          onHint={() => grid.toggleHint(q.id)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button id={CHECK_ID} variant="primary" onClick={grid.check} disabled={revealed}>
          Check answer
        </Button>
        <Button onClick={() => onNext(grade, revealed)} disabled={!done}>
          {last ? (
            'Finish'
          ) : (
            <>
              Continue
              <ChevronRight aria-hidden="true" className={ICON_AFTER} />
            </>
          )}
        </Button>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          <kbd>Alt+H</kbd> hint · <kbd>Alt+R</kbd> reveal · type a list like 1, 2, 3
        </p>
      </div>
    </div>
  )
}

/** Predict-the-next-pass quiz: one question at a time, graded with the shared answer cell, then a score. */
export function QuizPanel({ quiz }: { quiz: Quiz }) {
  if (quiz.unavailable) return <p className="text-sm text-slate-700 dark:text-slate-300">{quiz.unavailable}</p>
  if (quiz.finished && quiz.score) {
    return (
      <div className="flex flex-col gap-2">
        <ScoreBar score={quiz.score} />
        <div>
          <Button onClick={quiz.restart}>Try again</Button>
        </div>
      </div>
    )
  }
  const q = quiz.question
  if (!q) return null
  return <QuestionView key={q.id} q={q} number={quiz.n + 1} total={quiz.questions.length} onNext={quiz.next} />
}
