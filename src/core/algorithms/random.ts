/**
 * Random practice inputs. Pure and seeded. Every list is guaranteed to give the student something to trace:
 * the intentional "already sorted" case exists only as a labelled preset, never here.
 */
import { shuffled } from '../study/rng'

export const RANDOM_SORT_LENGTH = 6
export const RANDOM_SEARCH_LENGTH = 8
/** Out-of-order pairs: bubble sort makes exactly this many swaps, insertion sort this many shifts. */
export const MIN_INVERSIONS = 3
/** Linear search: the earliest index of a random target, so there are at least three comparisons. */
export const MIN_LINEAR_INDEX = 2

const MIN_RANDOM = 1
const MAX_RANDOM = 99

/** Pairs `i < j` with `data[i] > data[j]`. */
export const countInversions = (data: readonly number[]): number => {
  let n = 0
  for (let i = 0; i < data.length; i++) for (let j = i + 1; j < data.length; j++) if (data[i]! > data[j]!) n++
  return n
}

const between = (rng: () => number, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))

const distinctValues = (rng: () => number, length: number): number[] => {
  const out = new Set<number>()
  while (out.size < length) out.add(between(rng, MIN_RANDOM, MAX_RANDOM))
  return [...out]
}

/** Distinct values with at least MIN_INVERSIONS out-of-order pairs (so never sorted, never all the same). */
export const randomSortingList = (rng: () => number): number[] => {
  const values = distinctValues(rng, RANDOM_SORT_LENGTH)
  for (let attempt = 0; attempt < 50; attempt++) {
    const list = shuffled(values, rng)
    if (countInversions(list) >= MIN_INVERSIONS) return list
  }
  // only reachable with a broken rng: descending order has the most inversions there can be
  return values.sort((a, b) => b - a)
}

export interface SearchInput {
  data: number[]
  /** Always in `data`. */
  target: number
}

/**
 * Linear search: unsorted, target at index MIN_LINEAR_INDEX or later.
 * Binary search: strictly ascending, and the target is neither at index 0 nor at the first `mid`.
 */
export const randomSearchInput = (algo: 'linear' | 'binary', rng: () => number): SearchInput => {
  const values = distinctValues(rng, RANDOM_SEARCH_LENGTH)
  const data = algo === 'binary' ? values.sort((a, b) => a - b) : shuffled(values, rng)
  const firstMid = Math.floor((data.length - 1) / 2)
  const allowed = data
    .map((_, i) => i)
    .filter((i) => (algo === 'binary' ? i !== 0 && i !== firstMid : i >= MIN_LINEAR_INDEX))
  return { data, target: data[allowed[between(rng, 0, allowed.length - 1)]!]! }
}
