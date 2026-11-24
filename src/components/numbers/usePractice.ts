import { useCallback, useMemo } from 'react'
import { generateQuestions, gradeAnswer, hintFor, TOPICS, type Question, type Topic } from '../../core/numbers'
import { newSeed } from '../../core/study/rng'
import { summarise } from '../../core/study/score'
import { useAnswerGrid } from '../study/useAnswerGrid'

const CLOSE_CREDIT = 0.5
const KIND_LABEL: Record<Question['kind'], string> = {
  dec2bin: 'Denary → binary',
  bin2dec: 'Binary → denary',
  bin2hex: 'Binary → hex',
  hex2bin: 'Hex → binary',
  neg2twos: 'Negative → two’s complement',
  twos2dec: 'Two’s complement → denary',
  add: 'Binary addition',
  overflow: 'Overflow',
}

/** Practice mode: seeded questions, the generic answer grid for typing/hints/reveals/grading, and a score. */
export function usePractice(seed: number, topic: Topic | null, onSeed: (seed: number) => void) {
  const questions = useMemo(
    () => generateQuestions(seed, undefined, topic ? TOPICS[topic].kinds : undefined),
    [seed, topic],
  )
  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
  const keys = useMemo(() => questions.map((q) => q.id), [questions])

  const grade = useCallback((key: string, text: string) => gradeAnswer(byId.get(key)!, text), [byId])
  const grid = useAnswerGrid({ keys, grade })
  const { reset } = grid

  const score = useMemo(
    () =>
      grid.graded
        ? summarise(
            questions.map((q) => ({ key: q.id, colId: q.kind })),
            grid.graded,
            grid.revealed,
            CLOSE_CREDIT,
            (id) => KIND_LABEL[id as Question['kind']] ?? id,
          )
        : null,
    [questions, grid.graded, grid.revealed],
  )

  const next = () => {
    onSeed(newSeed())
    reset()
  }
  const hint = (q: Question) => (grid.hints[q.id] ? hintFor(q) : null)
  /** Working is shown only once the question has been checked or revealed. */
  const showWorking = (q: Question) => !!grid.revealed[q.id] || !!grid.graded?.[q.id]

  return { questions, grid, score, next, hint, showWorking, seed, label: (q: Question) => KIND_LABEL[q.kind] }
}

export type Practice = ReturnType<typeof usePractice>
