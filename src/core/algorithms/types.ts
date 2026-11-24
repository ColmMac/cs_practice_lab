export const ALGORITHMS = ['bubble', 'insertion', 'merge', 'linear', 'binary'] as const
export type AlgorithmId = (typeof ALGORITHMS)[number]

/** Hard cap so a bad caller cannot build an enormous step list. The UI limit (S4.2) is far lower. */
export const MAX_ITEMS = 200

export class AlgorithmError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AlgorithmError'
  }
}

/**
 * One thing that happened. Indices are 0-based positions in the array as it stood
 * BEFORE the step; `array` on `pass-end` is the state AFTER the pass.
 */
export type Step =
  /** Two elements were compared. `a` is at `i`, `b` at `j` (insertion sort: `j` is where the held key came from). */
  | { kind: 'compare'; i: number; j: number; a: number; b: number }
  | { kind: 'swap'; i: number; j: number }
  /** Insertion sort: `a[to] = a[from]` to open a gap for the held key. */
  | { kind: 'shift'; from: number; to: number; value: number }
  /** Insertion sort: the held key is written into the gap. */
  | { kind: 'insert'; index: number; value: number }
  /** Merge sort: the run `low..high` is divided at `mid` (left is `low..mid`). */
  | { kind: 'split'; low: number; mid: number; high: number; depth: number }
  /** Merge sort: runs `low..mid` and `mid+1..high` are written back as `result`; `from[k]` is where `result[k]` came from. */
  | { kind: 'merge'; low: number; mid: number; high: number; depth: number; result: number[]; from: number[] }
  /** Linear search looked at `i`. */
  | { kind: 'inspect'; i: number; value: number; match: boolean }
  /** Binary search probe: the live range and where `mid` fell. `relation` is `a[mid]` against the target. */
  | {
      kind: 'range'
      low: number
      mid: number
      high: number
      value: number
      relation: 'equal' | 'less' | 'greater'
    }
  | { kind: 'found'; i: number }
  | { kind: 'not-found' }
  /** A pass (bubble/insertion) or merge level finished. `pass` is 1-based. */
  | { kind: 'pass-end'; pass: number; array: number[] }

export interface Run {
  algo: AlgorithmId
  input: number[]
  target?: number
  steps: Step[]
  /** Sorting: the sorted array. Searching: the input, unchanged. */
  final: number[]
  comparisons: number
  swaps: number
  shifts: number
  /** Searching only: the index found, or null. */
  foundAt?: number | null
}

export interface RunOptions {
  /** Bubble sort: stop after a pass with no swaps (default true). */
  earlyExit?: boolean
}

export const validateInput = (data: readonly number[]): number[] => {
  if (!Array.isArray(data)) throw new AlgorithmError('The input must be a list of whole numbers.')
  if (data.length > MAX_ITEMS) throw new AlgorithmError(`Use at most ${MAX_ITEMS} items.`)
  for (const v of data) {
    if (!Number.isInteger(v)) throw new AlgorithmError('Every item must be a whole number.')
  }
  return [...data]
}
