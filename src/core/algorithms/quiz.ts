import type { Grade } from '../study/types'
import { sortedProblem } from './searching'
import type { Run } from './types'

export type QuizKind = 'list' | 'index'

/** One "predict the next state" question. `truth` is only ever shown after Reveal. */
export interface QuizQuestion {
  id: string
  kind: QuizKind
  /** Heading for the score breakdown. */
  label: string
  prompt: string
  /** Index into `buildFrames(run)` of the moment the question is asked (the start of the pass or probe). */
  before: number
  /** List questions: the array before the pass, so "unchanged" can be told apart from "wrong". */
  from?: number[]
  /** The right answer. */
  list?: number[]
  index?: number
  /** Binary search: the live range, for the "outside the range" and rounding messages. */
  low?: number
  high?: number
  truth: string
  hint: string
}

const fmt = (a: readonly number[]): string => `[${a.join(', ')}]`

const PASS_HINT = {
  bubble: 'Go along the list comparing neighbours; swap when the left one is bigger. The biggest item you meet is carried to the end.',
  insertion: 'One more item joins the sorted front: slide it left past every bigger item. Items after it have not moved.',
  merge: 'Neighbouring sorted runs are merged into longer sorted runs (a single item counts as a run). Work out which runs this level joins.',
} as const

/**
 * The questions for a run, in order. Sorting: the whole list after each pass (or merge level). Binary
 * search: the index probed (`mid`) at each probe. Linear search has nothing to predict, so no questions.
 */
export const buildQuiz = (run: Run): QuizQuestion[] => {
  if (run.algo === 'bubble' || run.algo === 'insertion' || run.algo === 'merge') {
    const out: QuizQuestion[] = []
    let from = run.input
    let start = 0
    const word = run.algo === 'merge' ? 'level' : 'pass'
    run.steps.forEach((s, i) => {
      if (s.kind !== 'pass-end') return
      // Merge sort splits everything first; the first level starts after the splits.
      let begin = start
      while (run.steps[begin]?.kind === 'split') begin++
      out.push({
        id: `q${out.length + 1}`,
        kind: 'list',
        label: run.algo === 'merge' ? 'Merge levels' : 'Passes',
        prompt: `Start from ${fmt(from)}. What is the whole list after ${word} ${s.pass}?`,
        before: begin,
        from,
        list: s.array,
        truth: fmt(s.array),
        hint: PASS_HINT[run.algo as keyof typeof PASS_HINT],
      })
      from = s.array
      start = i + 1
    })
    return out
  }
  if (run.algo === 'binary') {
    const out: QuizQuestion[] = []
    let prev: Extract<Run['steps'][number], { kind: 'range' }> | null = null
    run.steps.forEach((s, i) => {
      if (s.kind !== 'range') return
      const where = prev
        ? `The last probe was index ${prev.mid}, which held ${prev.value}; that is ${prev.relation === 'less' ? 'less than' : 'bigger than'} ${run.target}.`
        : `The whole list is in play, indices 0 to ${run.input.length - 1}.`
      out.push({
        id: `q${out.length + 1}`,
        kind: 'index',
        label: 'Probes',
        prompt: `Searching for ${run.target} in ${fmt(run.input)}. ${where} Which index is probed ${prev ? 'next' : 'first'} (mid)?`,
        before: i,
        index: s.mid,
        low: s.low,
        high: s.high,
        truth: String(s.mid),
        hint: 'mid = (low + high) DIV 2, rounded down. Work out the new low and high from the last probe first.',
      })
      prev = s
    })
    return out
  }
  return []
}

export const quizUnavailable = (run: Run | null): string | null => {
  if (!run) return 'Fix the input first.'
  if (run.algo === 'linear')
    return 'Linear search just looks at one item after another, so there is nothing to predict. Try binary search or a sort.'
  // every answer would be "the list stays as it is"
  if (run.algo !== 'binary' && sortedProblem(run.input) === null)
    return 'This list is already in order, so there is nothing to sort. Press New random list, or choose or type another list.'
  return null
}

const sameList = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((v, i) => v === b[i])

/** Parses "[1, 2, 3]" or "1 2 3" into whole numbers; null if anything is not one. */
export const parseAnswerList = (text: string): number[] | null => {
  const parts = text.split(/[\s,;[\]]+/).filter(Boolean)
  if (!parts.length || parts.some((p) => !/^[+-]?\d+$/.test(p))) return null
  return parts.map(Number)
}

/** Grades one answer. Messages never contain the right answer. */
export const gradeQuiz = (q: QuizQuestion, text: string): Grade => {
  if (!text.trim()) return { state: 'incorrect', message: 'No answer yet.' }
  if (q.kind === 'index') {
    const t = text.trim()
    if (!/^[+-]?\d+$/.test(t)) return { state: 'incorrect', message: 'Type a whole number: an index.' }
    const v = Number(t)
    if (v === q.index) return { state: 'correct' }
    const { low = 0, high = 0 } = q
    if (v < low || v > high) return { state: 'incorrect', message: 'That index has already been ruled out.' }
    if (v === Math.ceil((low + high) / 2)) return { state: 'close', message: 'Round the middle down, not up.' }
    return { state: 'incorrect', message: 'That is not the middle of the live range.' }
  }
  const got = parseAnswerList(text)
  if (!got) return { state: 'incorrect', message: 'Type the list as whole numbers, such as 1, 2, 3.' }
  const want = q.list!
  if (sameList(got, want)) return { state: 'correct' }
  if (got.length !== want.length) return { state: 'incorrect', message: `The list should still have ${want.length} items.` }
  if (q.from && sameList(got, q.from)) return { state: 'incorrect', message: 'That is the list before this step. Something moves.' }
  if (sameList([...got].sort((a, b) => a - b), [...want].sort((a, b) => a - b)))
    return { state: 'close', message: 'Right numbers, but not in the order they would be in.' }
  return { state: 'incorrect', message: 'Those are not the numbers in the list.' }
}
