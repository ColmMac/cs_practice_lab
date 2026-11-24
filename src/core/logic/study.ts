import { mulberry32, shuffled } from '../study/rng'
import type { Grade } from '../study/types'
import type { TruthNotation, TruthTable } from './table'

/** outputs: only the output columns · intermediates: intermediate and output columns · random: a seeded share of both. */
export type TruthMask = 'outputs' | 'intermediates' | 'random'

export interface TruthStudyConfig {
  mask: TruthMask
  /** 1–100; used by `random`. */
  percent: number
}

export const DEFAULT_TRUTH_STUDY: TruthStudyConfig = { mask: 'outputs', percent: 50 }

export interface TruthCell {
  /** `${row.index}:${column.key}` */
  key: string
  rowIndex: number
  colKey: string
  /** The ground truth. Used only for grading and the reveal. */
  truth: boolean
}

export const truthCellKey = (rowIndex: number, colKey: string): string => `${rowIndex}:${colKey}`

/** The cells a student can be asked: every intermediate and output cell (the inputs are given). */
export function askableCells(table: TruthTable): TruthCell[] {
  const out: TruthCell[] = []
  for (const row of table.rows) {
    table.columns.forEach((col, i) => {
      if (col.group === 'input') return
      out.push({ key: truthCellKey(row.index, col.key), rowIndex: row.index, colKey: col.key, truth: row.values[i]! })
    })
  }
  return out
}

/** Which cells are hidden. Deterministic for a given (config, seed). */
export function truthMasks(table: TruthTable, config: TruthStudyConfig, seed: number): Set<string> {
  const cells = askableCells(table)
  const group = new Map(table.columns.map((c) => [c.key, c.group]))
  if (config.mask === 'outputs') return new Set(cells.filter((c) => group.get(c.colKey) === 'output').map((c) => c.key))
  if (config.mask === 'intermediates') return new Set(cells.map((c) => c.key))

  const percent = Math.min(100, Math.max(0, Math.round(config.percent)))
  if (cells.length === 0 || percent === 0) return new Set()
  const count = Math.max(1, Math.round((cells.length * percent) / 100))
  return new Set(shuffled(cells, mulberry32(seed)).slice(0, count).map((c) => c.key))
}

const TRUE_WORDS = new Set(['1', 't', 'true'])
const FALSE_WORDS = new Set(['0', 'f', 'false'])

/**
 * Grades one answer. Any of 0/1/T/F/true/false is read as a truth value; a value that is right but spelled in
 * the other notation than the table shows is "Almost". Messages never contain the answer.
 */
export function gradeTruthAnswer(text: string, truth: boolean, notation: TruthNotation): Grade {
  const word = text.trim().toLowerCase()
  if (word === '') return { state: 'incorrect', message: 'No answer entered.' }
  const isTrue = TRUE_WORDS.has(word)
  if (!isTrue && !FALSE_WORDS.has(word)) return { state: 'incorrect', message: 'Answer with 0, 1, T or F.' }
  if (isTrue !== truth) return { state: 'incorrect' }

  const digit = word === '0' || word === '1'
  if (digit === (notation === '01')) return { state: 'correct' }
  return {
    state: 'close',
    message: notation === '01' ? 'Right value, but this table uses 0 and 1.' : 'Right value, but this table uses T and F.',
  }
}

/** Gives the shape of the answer, not the answer. */
export const TRUTH_HINT = 'a single truth value (0 or 1, T or F)'
