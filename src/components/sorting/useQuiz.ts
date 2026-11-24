import { useMemo, useState } from 'react'
import { quizUnavailable, type QuizQuestion, type Run } from '../../core/algorithms'
import { buildQuiz } from '../../core/algorithms'
import type { Grade } from '../../core/study/types'
import { summarise } from '../../core/study/score'

const CLOSE_CREDIT = 0.5

interface Progress {
  /** Which question set this belongs to; a new run starts the quiz again. */
  for: QuizQuestion[]
  n: number
  graded: Record<string, Grade>
  revealed: Record<string, true>
}

/** The quiz over a run: the current question, the results so far and the score. State restarts when the questions change. */
export function useQuiz(run: Run | null) {
  const questions = useMemo(() => (run ? buildQuiz(run) : []), [run])
  const [state, setState] = useState<Progress>({ for: questions, n: 0, graded: {}, revealed: {} })
  const cur: Progress = state.for === questions ? state : { for: questions, n: 0, graded: {}, revealed: {} }

  const finished = questions.length > 0 && cur.n >= questions.length
  const score = useMemo(
    () =>
      finished
        ? summarise(
            questions.map((q) => ({ key: q.id, colId: q.label })),
            cur.graded,
            cur.revealed,
            CLOSE_CREDIT,
            (id) => id,
          )
        : null,
    [finished, questions, cur.graded, cur.revealed],
  )

  return {
    questions,
    unavailable: quizUnavailable(run) ?? (questions.length ? null : 'There is nothing to predict in this run.'),
    n: cur.n,
    question: questions[cur.n] ?? null,
    finished,
    score,
    /** Records the outcome of the current question and moves on. */
    next: (grade: Grade | undefined, revealed: boolean) =>
      setState({
        for: questions,
        n: cur.n + 1,
        graded: !revealed && grade ? { ...cur.graded, [questions[cur.n]!.id]: grade } : cur.graded,
        revealed: revealed ? { ...cur.revealed, [questions[cur.n]!.id]: true } : cur.revealed,
      }),
    restart: () => setState({ for: questions, n: 0, graded: {}, revealed: {} }),
  }
}

export type Quiz = ReturnType<typeof useQuiz>
