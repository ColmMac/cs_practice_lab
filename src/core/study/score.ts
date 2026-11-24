import type { Grade } from './types'

export interface ColumnScore {
  colId: string
  header: string
  correct: number
  close: number
  incorrect: number
  total: number
}

export interface Score {
  /** Cells that count: masked and not revealed. */
  total: number
  correct: number
  close: number
  incorrect: number
  /** Revealed cells are excluded from the score. */
  revealed: number
  /** Counting cells that were edited after the last check (not graded yet). */
  pending: number
  points: number
  percent: number
  byColumn: ColumnScore[]
}

export interface ScoredCell {
  key: string
  colId: string
}

/** Tallies a checked session. Revealed cells don't count; `close` earns `closeCredit` of a mark. */
export function summarise(
  masked: ScoredCell[],
  graded: Record<string, Grade>,
  revealed: Record<string, true>,
  closeCredit: number,
  headerOf: (colId: string) => string,
): Score {
  const columns = new Map<string, ColumnScore>()
  const score: Score = { total: 0, correct: 0, close: 0, incorrect: 0, revealed: 0, pending: 0, points: 0, percent: 0, byColumn: [] }

  for (const cell of masked) {
    if (revealed[cell.key]) {
      score.revealed++
      continue
    }
    score.total++
    let col = columns.get(cell.colId)
    if (!col) columns.set(cell.colId, (col = { colId: cell.colId, header: headerOf(cell.colId), correct: 0, close: 0, incorrect: 0, total: 0 }))
    col.total++

    const g = graded[cell.key]
    if (!g) {
      score.pending++
    } else if (g.state === 'correct') {
      score.correct++
      col.correct++
    } else if (g.state === 'close') {
      score.close++
      col.close++
    } else {
      score.incorrect++
      col.incorrect++
    }
  }

  score.points = score.correct + score.close * closeCredit
  score.percent = score.total === 0 ? 0 : Math.round((score.points / score.total) * 100)
  score.byColumn = [...columns.values()]
  return score
}

/** `17 / 20`, `17.5 / 20` */
export const formatPoints = (points: number, total: number): string =>
  `${Number.isInteger(points) ? points : points.toFixed(1)} / ${total}`
