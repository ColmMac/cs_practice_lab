import type { Value } from '../types'

/**
 * equal     — the same value.
 * close     — the right value with a classic exam slip (int vs float, list vs tuple…). `why` names it.
 * different — wrong.
 */
export type Match = { kind: 'equal' } | { kind: 'close'; why: string } | { kind: 'different' }

const EQUAL: Match = { kind: 'equal' }
const DIFFERENT: Match = { kind: 'different' }
const close = (why: string): Match => ({ kind: 'close', why })

const SEQUENCES = new Set(['list', 'tuple', 'set', 'frozenset'])
type Seq = Extract<Value, { k: 'list' | 'tuple' | 'set' | 'frozenset' }>
const isSeq = (v: Value): v is Seq => SEQUENCES.has(v.k)
const isNum = (v: Value): v is Extract<Value, { k: 'int' | 'float' }> => v.k === 'int' || v.k === 'float'

const FLOAT_TOLERANCE = 1e-9

function toNumber(v: Extract<Value, { k: 'int' | 'float' }>): number {
  if (v.k === 'int') return Number(v.v)
  if (v.v === 'inf') return Infinity
  if (v.v === '-inf') return -Infinity
  if (v.v === 'nan') return NaN
  return Number(v.v)
}

/** Exactly equal, or within a tiny relative error (0.1 + 0.2 vs 0.30000000000000004 typed with fewer digits). */
export function floatsEqual(x: number, y: number): boolean {
  if (Number.isNaN(x) && Number.isNaN(y)) return true
  if (x === y) return true
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  return Math.abs(x - y) <= FLOAT_TOLERANCE * Math.max(Math.abs(x), Math.abs(y))
}

const brackets: Record<string, string> = {
  list: 'a list, written with [ ]',
  tuple: 'a tuple, written with ( )',
  set: 'a set, written with { }',
  frozenset: 'a frozenset, written frozenset({ ... })',
}

/** Merge item results: any different ⇒ different; otherwise the first slip, if any. */
function combine(results: Match[]): Match {
  let slip: Match | null = null
  for (const r of results) {
    if (r.kind === 'different') return DIFFERENT
    if (r.kind === 'close' && !slip) slip = r
  }
  return slip ?? EQUAL
}

function compareSequences(answer: Seq, truth: Seq): Match {
  if (answer.items.length !== truth.items.length) return DIFFERENT
  const unordered = answer.k === 'set' || answer.k === 'frozenset' || truth.k === 'set' || truth.k === 'frozenset'

  let items: Match
  if (!unordered) {
    items = combine(truth.items.map((t, i) => compareValues(answer.items[i]!, t)))
  } else {
    // match each truth item to a distinct answer item, preferring exact matches
    const free = [...answer.items]
    const results: Match[] = []
    for (const t of truth.items) {
      let at = free.findIndex((a) => compareValues(a, t).kind === 'equal')
      let m: Match = EQUAL
      if (at < 0) {
        at = free.findIndex((a) => compareValues(a, t).kind === 'close')
        if (at < 0) return DIFFERENT
        m = compareValues(free[at]!, t)
      }
      free.splice(at, 1)
      results.push(m)
    }
    items = combine(results)
  }

  if (items.kind === 'different') return DIFFERENT
  if (answer.k !== truth.k) return close(`Right items, but this should be ${brackets[truth.k]}.`)
  return items
}

function compareDicts(answer: Extract<Value, { k: 'dict' }>, truth: Extract<Value, { k: 'dict' }>): Match {
  if (answer.entries.length !== truth.entries.length) return DIFFERENT
  const free = [...answer.entries]
  const results: Match[] = []
  for (const [tk, tv] of truth.entries) {
    const at = free.findIndex(([ak]) => compareValues(ak, tk).kind === 'equal')
    if (at < 0) return DIFFERENT
    results.push(compareValues(free[at]![1], tv))
    free.splice(at, 1)
  }
  return combine(results)
}

/** Compares a student's parsed answer with the ground truth. Quote style, spacing and dict/set order never matter. */
export function compareValues(answer: Value, truth: Value): Match {
  if (isNum(answer) && isNum(truth)) {
    if (answer.k === truth.k) {
      if (answer.k === 'int') return answer.v === truth.v ? EQUAL : DIFFERENT
      return floatsEqual(toNumber(answer), toNumber(truth)) ? EQUAL : DIFFERENT
    }
    if (!floatsEqual(toNumber(answer), toNumber(truth))) return DIFFERENT
    return close(
      truth.k === 'float'
        ? 'Right number, but it should be a float (a decimal like 3.0). / always gives a float.'
        : 'Right number, but it should be an int (a whole number). // gives an int.',
    )
  }
  if (answer.k === 'bool' && truth.k === 'bool') return answer.v === truth.v ? EQUAL : DIFFERENT
  if (answer.k === 'none' && truth.k === 'none') return EQUAL
  if (answer.k === 'str' && truth.k === 'str') return answer.v === truth.v ? EQUAL : DIFFERENT
  if (isSeq(answer) && isSeq(truth)) return compareSequences(answer, truth)
  if (answer.k === 'dict' && truth.k === 'dict') return compareDicts(answer, truth)
  if (answer.k === 'cycle' && truth.k === 'cycle') return EQUAL
  return DIFFERENT
}
