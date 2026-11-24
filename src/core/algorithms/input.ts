import type { AlgorithmId } from './types'

/** The visualiser accepts a short list of small whole numbers so every value fits on a card. */
export const MIN_ITEMS = 2
export const MAX_CARDS = 12
export const MIN_VALUE = -99
export const MAX_VALUE = 999

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const WHOLE = /^[+-]?\d+$/

/** Parses "5, 1, 4" (commas, spaces or semicolons). Never throws. */
export const parseList = (text: string): Parsed<number[]> => {
  const parts = text.split(/[\s,;]+/).filter(Boolean)
  if (parts.length < MIN_ITEMS) return { ok: false, error: `Enter at least ${MIN_ITEMS} whole numbers, separated by commas.` }
  if (parts.length > MAX_CARDS) return { ok: false, error: `Use at most ${MAX_CARDS} numbers so they fit on screen.` }
  const out: number[] = []
  for (const p of parts) {
    if (!WHOLE.test(p)) return { ok: false, error: `“${p.slice(0, 12)}” is not a whole number.` }
    const v = Number(p)
    if (v < MIN_VALUE || v > MAX_VALUE) return { ok: false, error: `${v} is outside ${MIN_VALUE} to ${MAX_VALUE}.` }
    out.push(v)
  }
  return { ok: true, value: out }
}

export const parseTarget = (text: string): Parsed<number> => {
  const t = text.trim()
  if (!t) return { ok: false, error: 'Enter the number to search for.' }
  if (!WHOLE.test(t)) return { ok: false, error: 'The target must be a whole number.' }
  const v = Number(t)
  if (v < MIN_VALUE || v > MAX_VALUE) return { ok: false, error: `The target must be ${MIN_VALUE} to ${MAX_VALUE}.` }
  return { ok: true, value: v }
}

export interface AlgorithmInfo {
  id: AlgorithmId
  name: string
  kind: 'sort' | 'search'
}

export const ALGORITHM_INFO: readonly AlgorithmInfo[] = [
  { id: 'bubble', name: 'Bubble sort', kind: 'sort' },
  { id: 'insertion', name: 'Insertion sort', kind: 'sort' },
  { id: 'merge', name: 'Merge sort', kind: 'sort' },
  { id: 'linear', name: 'Linear search', kind: 'search' },
  { id: 'binary', name: 'Binary search', kind: 'search' },
]

export interface ListPreset {
  id: string
  label: string
  data: number[]
  /** Searches only: a good target for this list. */
  target?: number
}

export const LIST_PRESETS: readonly ListPreset[] = [
  { id: 'textbook', label: 'Textbook: 5, 1, 4, 2, 8', data: [5, 1, 4, 2, 8], target: 4 },
  { id: 'reversed', label: 'Reversed: 9, 7, 5, 3, 1', data: [9, 7, 5, 3, 1], target: 7 },
  { id: 'sorted', label: 'Already sorted: 1, 2, 3, 4, 5', data: [1, 2, 3, 4, 5], target: 5 },
  { id: 'duplicates', label: 'Duplicates: 4, 2, 4, 1, 2', data: [4, 2, 4, 1, 2], target: 1 },
  { id: 'eight', label: 'Eight items: 38, 27, 43, 3, 9, 82, 10, 5', data: [38, 27, 43, 3, 9, 82, 10, 5], target: 82 },
  { id: 'search', label: 'Sorted for searching: 3, 9, 10, 23, 27, 38, 43, 82', data: [3, 9, 10, 23, 27, 38, 43, 82], target: 23 },
]

export const findListPreset = (id: string): ListPreset | undefined => LIST_PRESETS.find((p) => p.id === id)
