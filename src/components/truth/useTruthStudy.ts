import { useCallback, useMemo, useState } from 'react'
import {
  askableCells,
  DEFAULT_TRUTH_STUDY,
  gradeTruthAnswer,
  truthMasks,
  type TruthNotation,
  type TruthStudyConfig,
  type TruthTable,
} from '../../core/logic'
import { newSeed } from '../../core/study/rng'
import { summarise } from '../../core/study/score'
import { useAnswerGrid } from '../study/useAnswerGrid'

const CLOSE_CREDIT = 0.5

/**
 * Study Mode for the truth table: the table is frozen when it begins, the masks come from a seed, and the
 * generic answer grid does the typing, hints, reveals and grading. Any change to the live table ends the session.
 */
export function useTruthStudy(table: TruthTable | null, notation: TruthNotation) {
  const [stored, setSession] = useState<{ table: TruthTable; seed: number } | null>(null)
  // The table on screen is the frozen one: if the expression or options change under it, the session is over.
  const session = stored && stored.table === table ? stored : null
  const [config, setConfigState] = useState<TruthStudyConfig>(DEFAULT_TRUTH_STUDY)

  const cells = useMemo(() => (session ? askableCells(session.table) : []), [session])
  const masked = useMemo(() => (session ? truthMasks(session.table, config, session.seed) : new Set<string>()), [session, config])
  const questions = useMemo(() => cells.filter((c) => masked.has(c.key)), [cells, masked])
  const keys = useMemo(() => questions.map((c) => c.key), [questions])
  const truth = useMemo(() => new Map(cells.map((c) => [c.key, c.truth])), [cells])

  const grade = useCallback((key: string, text: string) => gradeTruthAnswer(text, truth.get(key) ?? false, notation), [truth, notation])
  const grid = useAnswerGrid({ keys, grade })
  const { reset } = grid

  const score = useMemo(() => {
    if (!session || !grid.graded) return null
    const label = new Map(session.table.columns.map((c) => [c.key, c.label]))
    const scored = questions.map((c) => ({ key: c.key, colId: c.colKey }))
    return summarise(scored, grid.graded, grid.revealed, CLOSE_CREDIT, (id) => label.get(id) ?? id)
  }, [session, questions, grid.graded, grid.revealed])

  const start = () => {
    if (!table) return
    reset()
    setSession({ table, seed: newSeed() })
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[data-study-key]')?.focus())
  }
  const exit = () => setSession(null)
  const setConfig = (patch: Partial<TruthStudyConfig>) => {
    setConfigState((c) => ({ ...c, ...patch }))
    reset() // different questions: old answers no longer belong to them
  }
  const reshuffle = () => {
    setSession((s) => (s ? { ...s, seed: newSeed() } : s))
    reset()
  }

  return {
    active: session !== null,
    table: session?.table ?? null,
    config,
    masked,
    questions: questions.length,
    cellCount: cells.length,
    hasIntermediates: !!session?.table.columns.some((c) => c.group === 'intermediate'),
    grid,
    score,
    start,
    exit,
    setConfig,
    reshuffle,
  }
}

export type TruthStudy = ReturnType<typeof useTruthStudy>
