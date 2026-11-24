import { describe, expect, it } from 'vitest'
import {
  AlgorithmError,
  binarySearch,
  bubbleSort,
  insertionSort,
  linearSearch,
  mergeSort,
  passSnapshots,
  runAlgorithm,
  sortedProblem,
  type Run,
} from '../../src/core/algorithms'

const TEXTBOOK = [5, 1, 4, 2, 8]
const SORTED_TEXTBOOK = [1, 2, 4, 5, 8]
const SORTERS = { bubble: bubbleSort, insertion: insertionSort, merge: mergeSort }

// Small deterministic generator, so a failure is reproducible.
const lcg = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
const randomArrays = (count: number): number[][] => {
  const next = lcg(12345)
  return Array.from({ length: count }, () =>
    Array.from({ length: Math.floor(next() * 13) }, () => Math.floor(next() * 40) - 10),
  )
}

describe('sorting: final state', () => {
  for (const [name, sort] of Object.entries(SORTERS)) {
    it(`${name} sort sorts random inputs and leaves the input alone`, () => {
      for (const data of randomArrays(300)) {
        const copy = [...data]
        const run = sort(data)
        expect(run.final).toEqual([...data].sort((x, y) => x - y))
        expect(data).toEqual(copy)
        expect(run.input).toEqual(copy)
      }
    })
    it(`${name} sort handles empty and single-item lists`, () => {
      expect(sort([]).final).toEqual([])
      expect(sort([7]).final).toEqual([7])
    })
  }
})

describe('bubble sort: hand-checked [5,1,4,2,8]', () => {
  // Pass 1: 5>1 swap, 5>4 swap, 5>2 swap, 5<8 keep = 4 compares, 3 swaps.
  // Pass 2: 1<4, 4>2 swap, 4<5 = 3 compares, 1 swap.
  // Pass 3: 1<2, 2<4 = 2 compares, 0 swaps, so the early exit stops here.
  it('with early exit', () => {
    const run = bubbleSort(TEXTBOOK)
    expect(passSnapshots(run)).toEqual([
      [1, 4, 2, 5, 8],
      [1, 2, 4, 5, 8],
      [1, 2, 4, 5, 8],
    ])
    expect([run.comparisons, run.swaps, run.shifts]).toEqual([9, 4, 0])
  })
  it('without early exit runs n-1 passes (one more compare)', () => {
    const run = bubbleSort(TEXTBOOK, { earlyExit: false })
    expect(passSnapshots(run)).toHaveLength(4)
    expect([run.comparisons, run.swaps]).toEqual([10, 4])
  })
  it('records each compare then swap in order', () => {
    const first = bubbleSort(TEXTBOOK).steps.slice(0, 4)
    expect(first).toEqual([
      { kind: 'compare', i: 0, j: 1, a: 5, b: 1 },
      { kind: 'swap', i: 0, j: 1 },
      { kind: 'compare', i: 1, j: 2, a: 5, b: 4 },
      { kind: 'swap', i: 1, j: 2 },
    ])
  })
  it('[3,2,1]: worst case does 3 compares and 3 swaps', () => {
    const run = bubbleSort([3, 2, 1])
    expect(passSnapshots(run)).toEqual([
      [2, 1, 3],
      [1, 2, 3],
    ])
    expect([run.comparisons, run.swaps]).toEqual([3, 3])
  })
  it('an already sorted list stops after one pass', () => {
    const run = bubbleSort([1, 2, 3, 4])
    expect(passSnapshots(run)).toHaveLength(1)
    expect([run.comparisons, run.swaps]).toEqual([3, 0])
  })
})

describe('insertion sort: hand-checked [5,1,4,2,8]', () => {
  // key 1: 5>1 shift = 1 compare, 1 shift. key 4: 5>4 shift, 1<=4 stop = 2, 1.
  // key 2: 5>2 shift, 4>2 shift, 1<=2 stop = 3, 2. key 8: 5<=8 stop = 1, 0.
  it('pass snapshots and counters', () => {
    const run = insertionSort(TEXTBOOK)
    expect(passSnapshots(run)).toEqual([
      [1, 5, 4, 2, 8],
      [1, 4, 5, 2, 8],
      [1, 2, 4, 5, 8],
      [1, 2, 4, 5, 8],
    ])
    expect([run.comparisons, run.swaps, run.shifts]).toEqual([7, 0, 4])
  })
  it('the first pass shifts the 5 then inserts the 1 at the front', () => {
    expect(insertionSort(TEXTBOOK).steps.slice(0, 4)).toEqual([
      { kind: 'compare', i: 0, j: 1, a: 5, b: 1 },
      { kind: 'shift', from: 0, to: 1, value: 5 },
      { kind: 'insert', index: 0, value: 1 },
      { kind: 'pass-end', pass: 1, array: [1, 5, 4, 2, 8] },
    ])
  })
  it('[3,2,1] needs 3 compares and 3 shifts', () => {
    const run = insertionSort([3, 2, 1])
    expect(passSnapshots(run)).toEqual([
      [2, 3, 1],
      [1, 2, 3],
    ])
    expect([run.comparisons, run.shifts]).toEqual([3, 3])
  })
})

describe('merge sort: hand-checked [5,1,4,2,8]', () => {
  // Tree: [0..4] -> [0..2] + [3..4]; [0..2] -> [0..1] + [2]; [0..1] -> [0] + [1]; [3..4] -> [3] + [4].
  // Level 1 (deepest): [5]+[1] = 1 compare. Level 2: [1,5]+[4] = 2 compares, [2]+[8] = 1.
  // Level 3 (root): [1,4,5]+[2,8]: 1v2, 4v2, 4v8, 5v8 = 4 compares. Total 8.
  it('one pass per merge level', () => {
    const run = mergeSort(TEXTBOOK)
    expect(passSnapshots(run)).toEqual([
      [1, 5, 4, 2, 8],
      [1, 4, 5, 2, 8],
      [1, 2, 4, 5, 8],
    ])
    expect([run.comparisons, run.swaps, run.shifts]).toEqual([8, 0, 0])
  })
  it('splits come first, top-down, then the merges', () => {
    const kinds = mergeSort(TEXTBOOK).steps.filter((s) => s.kind === 'split' || s.kind === 'merge')
    expect(kinds.map((s) => (s.kind === 'split' ? `s${s.low}-${s.high}` : `m${s.low}-${s.high}`))).toEqual([
      's0-4',
      's0-2',
      's0-1',
      's3-4',
      'm0-1',
      'm0-2',
      'm3-4',
      'm0-4',
    ])
  })
  it('[3,2,1] sorts in two levels with 2 compares', () => {
    const run = mergeSort([3, 2, 1])
    expect(passSnapshots(run)).toEqual([
      [2, 3, 1],
      [1, 2, 3],
    ])
    expect(run.comparisons).toBe(2)
  })
})

describe('stability', () => {
  // Replay the recorded steps over items tagged with their start position.
  const tags = [3, 1, 3, 1, 2, 3, 1, 2]
  const expected = [...tags.keys()].sort((x, y) => tags[x]! - tags[y]! || x - y)

  it('bubble sort keeps equal items in their original order', () => {
    const order = [...tags.keys()]
    for (const s of bubbleSort(tags).steps) if (s.kind === 'swap') [order[s.i], order[s.j]] = [order[s.j]!, order[s.i]!]
    expect(order).toEqual(expected)
  })
  it('insertion sort keeps equal items in their original order', () => {
    const order = [...tags.keys()]
    let held = -1
    for (const s of insertionSort(tags).steps) {
      if (s.kind === 'compare' && held < 0) held = order[s.j]!
      if (s.kind === 'shift') order[s.to] = order[s.from]!
      if (s.kind === 'insert') {
        order[s.index] = held
        held = -1
      }
      if (s.kind === 'pass-end') held = -1
    }
    expect(order).toEqual(expected)
  })
  it('merge sort keeps equal items in their original order', () => {
    const order = [...tags.keys()]
    for (const s of mergeSort(tags).steps) {
      if (s.kind !== 'merge') continue
      const moved = s.from.map((p) => order[p]!)
      moved.forEach((id, k) => (order[s.low + k] = id))
    }
    expect(order).toEqual(expected)
  })
})

describe('linear search', () => {
  it('finds a value after inspecting up to it', () => {
    const run = linearSearch([4, 9, 2, 7], 2)
    expect(run.steps).toEqual([
      { kind: 'inspect', i: 0, value: 4, match: false },
      { kind: 'inspect', i: 1, value: 9, match: false },
      { kind: 'inspect', i: 2, value: 2, match: true },
      { kind: 'found', i: 2 },
    ])
    expect(run.comparisons).toBe(3)
    expect(run.foundAt).toBe(2)
  })
  it('reports not-found after looking at every item; the first match wins', () => {
    const miss = linearSearch([4, 9], 5)
    expect(miss.steps.at(-1)).toEqual({ kind: 'not-found' })
    expect([miss.comparisons, miss.foundAt]).toEqual([2, null])
    expect(linearSearch([3, 3], 3).foundAt).toBe(0)
  })
  it('works on an empty list', () => {
    expect(linearSearch([], 1).steps).toEqual([{ kind: 'not-found' }])
  })
})

describe('binary search (mid = floor((low + high) / 2), 0-based)', () => {
  const data = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
  const mids = (run: Run) => run.steps.flatMap((s) => (s.kind === 'range' ? [s.mid] : []))

  it('finds 23: probes 4 (16), 7 (56), 5 (23)', () => {
    const run = binarySearch(data, 23)
    expect(run.steps.filter((s) => s.kind === 'range')).toEqual([
      { kind: 'range', low: 0, mid: 4, high: 9, value: 16, relation: 'less' },
      { kind: 'range', low: 5, mid: 7, high: 9, value: 56, relation: 'greater' },
      { kind: 'range', low: 5, mid: 5, high: 6, value: 23, relation: 'equal' },
    ])
    expect(run.steps.at(-1)).toEqual({ kind: 'found', i: 5 })
    expect([run.comparisons, run.foundAt]).toEqual([3, 5])
  })
  it('misses 7: probes 4, 1, 2 then the range is empty', () => {
    const run = binarySearch(data, 7)
    expect(mids(run)).toEqual([4, 1, 2])
    expect(run.steps.at(-1)).toEqual({ kind: 'not-found' })
    expect(run.foundAt).toBeNull()
  })
  it('agrees with indexOf for every value, and never probes more than log2(n)+1 times', () => {
    for (let t = 0; t <= 95; t++) {
      const run = binarySearch(data, t)
      expect(run.foundAt).toBe(data.includes(t) ? data.indexOf(t) : null)
      expect(run.comparisons).toBeLessThanOrEqual(4)
    }
  })
  it('accepts duplicates and single items', () => {
    expect(binarySearch([1, 2, 2, 3], 2).foundAt).not.toBeNull()
    expect(binarySearch([5], 5).foundAt).toBe(0)
    expect(binarySearch([], 5).steps).toEqual([{ kind: 'not-found' }])
  })
  it('refuses an unsorted list with a clear message', () => {
    expect(() => binarySearch([3, 1, 2], 1)).toThrow(AlgorithmError)
    expect(() => binarySearch([3, 1, 2], 1)).toThrow(/sorted.*3 comes before 1/)
    expect(sortedProblem([1, 2, 2, 3])).toBeNull()
    expect(sortedProblem([2, 1])).toMatch(/Sort it first/)
  })
})

describe('input checks and runAlgorithm', () => {
  it('rejects non-integers, huge lists and a missing or bad target', () => {
    expect(() => bubbleSort([1, 2.5])).toThrow(AlgorithmError)
    expect(() => bubbleSort([1, NaN])).toThrow(AlgorithmError)
    expect(() => mergeSort(new Array(201).fill(1))).toThrow(/at most/)
    expect(() => runAlgorithm('linear', [1])).toThrow(/search for/)
    expect(() => linearSearch([1], 1.5)).toThrow(AlgorithmError)
  })
  it('dispatches by id', () => {
    expect(runAlgorithm('bubble', TEXTBOOK, { earlyExit: false }).comparisons).toBe(10)
    expect(runAlgorithm('insertion', TEXTBOOK).final).toEqual(SORTED_TEXTBOOK)
    expect(runAlgorithm('merge', TEXTBOOK).final).toEqual(SORTED_TEXTBOOK)
    expect(runAlgorithm('linear', TEXTBOOK, { target: 8 }).foundAt).toBe(4)
    expect(runAlgorithm('binary', SORTED_TEXTBOOK, { target: 8 }).foundAt).toBe(4)
  })
  it('a search leaves the data untouched', () => {
    expect(linearSearch(TEXTBOOK, 4).final).toEqual(TEXTBOOK)
  })
})
