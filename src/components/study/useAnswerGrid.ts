import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'
import type { Grade } from '../../core/study/types'
import { focusInput, nextStudyInput } from './navigation'

/** The id of the "Check answers" button: the end of the quiz, where Enter on the last box lands. */
export const CHECK_ID = 'study-check'

export interface AnswerKeyActions {
  onHint: (key: string) => void
  onReveal: (key: string) => void
}

/**
 * The keyboard contract for a grid of answer boxes, as a `keydown` handler for the `<table>`:
 * Enter/↓ next, Shift+Enter/↑ previous, Alt+H hint, Alt+R reveal (Ctrl/⌘ combinations are left alone, so
 * Ctrl+Enter still runs). Only keys that come from an answer box are handled: a row's own handlers must
 * ignore keys that bubble up from an input.
 */
export function answerGridKeyDown({ onHint, onReveal }: AnswerKeyActions) {
  return (e: KeyboardEvent<HTMLElement>) => {
    const input = e.target
    if (!(input instanceof HTMLInputElement) || !input.dataset.studyKey || e.ctrlKey || e.metaKey) return
    const key = input.dataset.studyKey
    const grid = e.currentTarget

    if (e.altKey && e.key.toLowerCase() === 'h') {
      e.preventDefault()
      onHint(key)
    } else if (e.altKey && e.key.toLowerCase() === 'r') {
      e.preventDefault()
      const next = nextStudyInput(grid, input, 1)
      onReveal(key) // this box turns into plain text, so move on first
      if (!focusInput(next)) focusInput(document.getElementById(CHECK_ID))
    } else if (!e.altKey && (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const delta = e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey) ? -1 : 1
      const next = nextStudyInput(grid, input, delta)
      if (!focusInput(next) && delta > 0) focusInput(document.getElementById(CHECK_ID)) // end of the quiz: on to Check answers
    }
  }
}

const without = <T,>(rec: Record<string, T> | null, key: string): Record<string, T> | null => {
  if (!rec || !(key in rec)) return rec
  const rest = { ...rec }
  delete rest[key]
  return rest
}

export interface AnswerGridOptions {
  /** The questions: one key per answer box. */
  keys: readonly string[]
  /** Grades one answer. Must never put the right answer in the message. */
  grade: (key: string, text: string) => Grade
}

/**
 * State for a self-test grid that is independent of any tool: answers, hints, reveals, grades, and the
 * keyboard handler. (Trace Study Mode keeps the same state in its persisted store and shares only
 * `answerGridKeyDown`.) Editing or revealing a cell clears its grade, so it counts as "pending" until re-checked.
 */
export function useAnswerGrid({ keys, grade }: AnswerGridOptions) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [revealed, setRevealed] = useState<Record<string, true>>({})
  const [hints, setHints] = useState<Record<string, true>>({})
  const [graded, setGraded] = useState<Record<string, Grade> | null>(null)

  const setAnswer = useCallback((key: string, text: string) => {
    setAnswers((a) => ({ ...a, [key]: text }))
    setGraded((g) => without(g, key))
  }, [])
  const reveal = useCallback((key: string) => {
    setRevealed((r) => ({ ...r, [key]: true }))
    setGraded((g) => without(g, key))
  }, [])
  const toggleHint = useCallback((key: string) => {
    setHints((h) => {
      if (h[key]) return without(h, key) as Record<string, true>
      return { ...h, [key]: true }
    })
  }, [])
  const reset = useCallback(() => {
    setAnswers({})
    setRevealed({})
    setHints({})
    setGraded(null)
  }, [])
  const check = useCallback(() => {
    const next: Record<string, Grade> = {}
    for (const key of keys) if (!revealed[key]) next[key] = grade(key, answers[key] ?? '')
    setGraded(next)
  }, [keys, grade, answers, revealed])

  const onKeyDown = useMemo(() => answerGridKeyDown({ onHint: toggleHint, onReveal: reveal }), [toggleHint, reveal])

  return { answers, revealed, hints, graded, setAnswer, reveal, toggleHint, reset, check, onKeyDown }
}

export type AnswerGrid = ReturnType<typeof useAnswerGrid>
