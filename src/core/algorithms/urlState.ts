/**
 * URL state for the Sorting & searching page (S4.5). Everything here is untrusted input from a link,
 * so each value is checked and anything odd falls back to the default.
 */
import { LIST_PRESETS, parseList, parseTarget } from './input'
import { ALGORITHMS, type AlgorithmId } from './types'

export interface SortingUrlState {
  algo: AlgorithmId
  /** A valid list from the link, or null (use the default). */
  data: number[] | null
  /** A valid target from the link, or null (use the default). */
  target: number | null
  quiz: boolean
}

const DEFAULT = LIST_PRESETS[0]!
const get = (params: URLSearchParams, key: string): string => (params.get(key) ?? '').slice(0, 200)

export function parseSortingUrl(params: URLSearchParams): SortingUrlState {
  const a = get(params, 'algo')
  const algo = (ALGORITHMS as readonly string[]).includes(a) ? (a as AlgorithmId) : 'bubble'

  const list = get(params, 'data') ? parseList(get(params, 'data')) : null
  const target = get(params, 'target') ? parseTarget(get(params, 'target')) : null

  return {
    algo,
    data: list?.ok ? list.value : null,
    target: target?.ok ? target.value : null,
    quiz: get(params, 'quiz') === '1',
  }
}

/** The query string for the current state; defaults are left out so a plain page keeps a plain URL. */
export function sortingUrlParams(state: {
  algo: AlgorithmId
  /** The list as typed, only when it parses. */
  data: number[] | null
  /** The target as typed, only when it parses (and only meaningful for searches). */
  target: number | null
  search: boolean
  quiz: boolean
}): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.algo !== 'bubble') out.algo = state.algo
  if (state.data && state.data.join(',') !== DEFAULT.data.join(',')) out.data = state.data.join(',')
  if (state.search && state.target !== null && state.target !== DEFAULT.target) out.target = String(state.target)
  if (state.quiz) out.quiz = '1'
  return out
}
