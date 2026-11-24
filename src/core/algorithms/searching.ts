import { AlgorithmError, validateInput, type Run, type Step } from './types'

const checkTarget = (target: number): void => {
  if (!Number.isInteger(target)) throw new AlgorithmError('The target must be a whole number.')
}

/** `null` when the list is in non-decreasing order, else a friendly reason. */
export const sortedProblem = (data: readonly number[]): string | null => {
  for (let i = 1; i < data.length; i++) {
    if (data[i - 1]! > data[i]!) {
      return `Binary search needs a sorted list, but ${data[i - 1]} comes before ${data[i]} (positions ${i - 1} and ${i}). Sort it first.`
    }
  }
  return null
}

const result = (algo: Run['algo'], input: number[], target: number, steps: Step[], foundAt: number | null): Run => ({
  algo,
  input,
  target,
  steps,
  final: [...input],
  comparisons: steps.filter((s) => s.kind === (algo === 'linear' ? 'inspect' : 'range')).length,
  swaps: 0,
  shifts: 0,
  foundAt,
})

/** Linear search. Each `inspect` is one comparison with the target. */
export const linearSearch = (data: readonly number[], target: number): Run => {
  const input = validateInput(data)
  checkTarget(target)
  const steps: Step[] = []
  for (let i = 0; i < input.length; i++) {
    const match = input[i] === target
    steps.push({ kind: 'inspect', i, value: input[i]!, match })
    if (match) {
      steps.push({ kind: 'found', i })
      return result('linear', input, target, steps, i)
    }
  }
  steps.push({ kind: 'not-found' })
  return result('linear', input, target, steps, null)
}

/**
 * Binary search with `mid = (low + high) DIV 2` (floor, 0-based). Each `range` step is one probe
 * and counts as one comparison (a three-way compare of `a[mid]` with the target). Throws an
 * `AlgorithmError` for an unsorted list.
 */
export const binarySearch = (data: readonly number[], target: number): Run => {
  const input = validateInput(data)
  checkTarget(target)
  const problem = sortedProblem(input)
  if (problem) throw new AlgorithmError(problem)
  const steps: Step[] = []
  let low = 0
  let high = input.length - 1
  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    const value = input[mid]!
    const relation = value === target ? 'equal' : value < target ? 'less' : 'greater'
    steps.push({ kind: 'range', low, mid, high, value, relation })
    if (relation === 'equal') {
      steps.push({ kind: 'found', i: mid })
      return result('binary', input, target, steps, mid)
    }
    if (relation === 'less') low = mid + 1
    else high = mid - 1
  }
  steps.push({ kind: 'not-found' })
  return result('binary', input, target, steps, null)
}
