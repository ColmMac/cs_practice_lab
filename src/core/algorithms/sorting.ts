import { validateInput, type AlgorithmId, type Run, type RunOptions, type Step } from './types'

const finish = (algo: AlgorithmId, input: number[], steps: Step[], final: number[]): Run => {
  let comparisons = 0
  let swaps = 0
  let shifts = 0
  for (const s of steps) {
    if (s.kind === 'compare') comparisons++
    else if (s.kind === 'swap') swaps++
    else if (s.kind === 'shift') shifts++
  }
  return { algo, input, steps, final, comparisons, swaps, shifts }
}

/** Bubble sort. Swaps only when strictly greater, so equal items keep their order (stable). */
export const bubbleSort = (data: readonly number[], options: RunOptions = {}): Run => {
  const input = validateInput(data)
  const earlyExit = options.earlyExit ?? true
  const a = [...input]
  const steps: Step[] = []
  for (let pass = 1; pass < a.length; pass++) {
    let swapped = false
    for (let i = 0; i < a.length - pass; i++) {
      steps.push({ kind: 'compare', i, j: i + 1, a: a[i]!, b: a[i + 1]! })
      if (a[i]! > a[i + 1]!) {
        steps.push({ kind: 'swap', i, j: i + 1 })
        ;[a[i], a[i + 1]] = [a[i + 1]!, a[i]!]
        swapped = true
      }
    }
    steps.push({ kind: 'pass-end', pass, array: [...a] })
    if (earlyExit && !swapped) break
  }
  return finish('bubble', input, steps, a)
}

/**
 * Insertion sort. The key is held aside; larger items shift right one place until the gap is
 * in the right spot. A `compare`'s `j` is where the key started. One pass per key.
 */
export const insertionSort = (data: readonly number[]): Run => {
  const input = validateInput(data)
  const a = [...input]
  const steps: Step[] = []
  for (let i = 1; i < a.length; i++) {
    const key = a[i]!
    let j = i - 1
    while (j >= 0) {
      steps.push({ kind: 'compare', i: j, j: i, a: a[j]!, b: key })
      if (a[j]! <= key) break
      steps.push({ kind: 'shift', from: j, to: j + 1, value: a[j]! })
      a[j + 1] = a[j]!
      j--
    }
    steps.push({ kind: 'insert', index: j + 1, value: key })
    a[j + 1] = key
    steps.push({ kind: 'pass-end', pass: i, array: [...a] })
  }
  return finish('insertion', input, steps, a)
}

interface Node {
  low: number
  mid: number
  high: number
  depth: number
}

/**
 * Top-down merge sort. The splits come first (depth-first, left before right), then the merges
 * run one LEVEL at a time from the deepest level up, so a "pass" is one merge level and its
 * `pass-end` snapshot shows every merge at that depth (and deeper) done. Equal items take the
 * left run first (stable).
 */
export const mergeSort = (data: readonly number[]): Run => {
  const input = validateInput(data)
  const a = [...input]
  const steps: Step[] = []
  const merges: Node[] = []

  const divide = (low: number, high: number, depth: number): void => {
    if (low >= high) return
    const mid = (low + high) >> 1
    steps.push({ kind: 'split', low, mid, high, depth })
    divide(low, mid, depth + 1)
    divide(mid + 1, high, depth + 1)
    merges.push({ low, mid, high, depth })
  }
  divide(0, a.length - 1, 0)

  const maxDepth = merges.reduce((m, n) => Math.max(m, n.depth), -1)
  let pass = 0
  for (let depth = maxDepth; depth >= 0; depth--) {
    for (const n of merges.filter((m) => m.depth === depth).sort((x, y) => x.low - y.low)) {
      const result: number[] = []
      const from: number[] = []
      let i = n.low
      let j = n.mid + 1
      while (i <= n.mid && j <= n.high) {
        steps.push({ kind: 'compare', i, j, a: a[i]!, b: a[j]! })
        const k = a[i]! <= a[j]! ? i++ : j++
        result.push(a[k]!)
        from.push(k)
      }
      for (; i <= n.mid; i++) {
        result.push(a[i]!)
        from.push(i)
      }
      for (; j <= n.high; j++) {
        result.push(a[j]!)
        from.push(j)
      }
      steps.push({ kind: 'merge', ...n, result, from })
      result.forEach((v, k) => (a[n.low + k] = v))
    }
    steps.push({ kind: 'pass-end', pass: ++pass, array: [...a] })
  }
  return finish('merge', input, steps, a)
}
