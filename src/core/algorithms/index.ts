import { binarySearch, linearSearch } from './searching'
import { bubbleSort, insertionSort, mergeSort } from './sorting'
import { AlgorithmError, type AlgorithmId, type Run, type RunOptions } from './types'

export { bubbleSort, insertionSort, mergeSort } from './sorting'
export { binarySearch, linearSearch, sortedProblem } from './searching'
export {
  ALGORITHMS,
  AlgorithmError,
  MAX_ITEMS,
  type AlgorithmId,
  type Run,
  type RunOptions,
  type Step,
} from './types'

export const isSearch = (algo: AlgorithmId): boolean => algo === 'linear' || algo === 'binary'

/** Run any algorithm by id. Searches need a `target`. */
export const runAlgorithm = (
  algo: AlgorithmId,
  data: readonly number[],
  options: RunOptions & { target?: number } = {},
): Run => {
  switch (algo) {
    case 'bubble':
      return bubbleSort(data, options)
    case 'insertion':
      return insertionSort(data)
    case 'merge':
      return mergeSort(data)
    case 'linear':
    case 'binary': {
      if (options.target === undefined) throw new AlgorithmError('Choose a number to search for.')
      return (algo === 'linear' ? linearSearch : binarySearch)(data, options.target)
    }
  }
}

/** The array after each pass, in order (sorting runs). */
export const passSnapshots = (run: Run): number[][] =>
  run.steps.flatMap((s) => (s.kind === 'pass-end' ? [s.array] : []))
