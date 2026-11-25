import { OUTPUT_COL, LINE_COL, STACK_COL } from '../derive/columns'
import type { ColumnDef, TraceResult, TraceRow } from '../types'
import { sampleShare } from './rng'
import { cellKey, type StudyConfig, type Truth } from './types'

export interface MaskableCell {
  key: string
  stepIndex: number
  rowIndex: number
  colId: string
  truth: Truth
  /** A variable's starting value, written out in the code (`total = 0`): left filled in by automatic masks. */
  given?: boolean
}

/**
 * Keys of the cells where a variable FIRST gets a value, from a line that only assigns written-out constants.
 * Later writes of a constant (`found = True`, resetting a total in an outer loop) are real changes and stay
 * questions. "First" is per frame, so each call of a function has its own starting values.
 */
export function constantStarts(result: TraceResult): Set<string> {
  const frameName = new Map<number, string>()
  for (const s of result.steps) for (const f of s.callStack) frameName.set(f.id, f.name)
  const seen = new Set<string>()
  const out = new Set<string>()
  for (const step of result.steps) {
    const constant = !!result.lines?.[step.lineNumber]?.constant
    for (const w of step.writes) {
      const variable = `${w.frameId}:${w.name}`
      if (constant && !seen.has(variable)) out.add(cellKey(step.stepIndex, `${frameName.get(w.frameId)}:${w.name}`))
      seen.add(variable)
    }
  }
  return out
}

/**
 * Cells a student can be asked to predict: the ones the program WRITES on that row (a variable assigned or
 * changed, a return value, printed output). Cells that merely carry an old value forward are context, not
 * questions. The Line and Call stack columns are never asked, and neither are watch cells that failed.
 */
export function maskableCells(rows: TraceRow[], columns: ColumnDef[], starts?: ReadonlySet<string>): MaskableCell[] {
  const out: MaskableCell[] = []
  for (const row of rows) {
    const stepIndex = row.stepIndices[0]!
    for (const col of columns) {
      if (col.id === LINE_COL || col.id === STACK_COL) continue
      const cell = row.cells[col.id]
      if (!cell?.written) continue
      let truth: Truth
      if (col.id === OUTPUT_COL) truth = { kind: 'output', text: cell.display }
      else if (cell.value !== undefined) truth = { kind: 'value', value: cell.value }
      else continue
      const key = cellKey(stepIndex, col.id)
      const question: MaskableCell = { key, stepIndex, rowIndex: row.rowIndex, colId: col.id, truth }
      if (starts?.has(key)) question.given = true
      out.push(question)
    }
  }
  return out
}

/** The cells worth asking. If every one is a given, they are all we have, so they are asked after all. */
const worthAsking = (cells: MaskableCell[]): MaskableCell[] => {
  const worked = cells.filter((c) => !c.given)
  return worked.length ? worked : cells
}

/**
 * Which of the maskable cells are hidden. Deterministic for a given (config, seed). The automatic modes leave
 * constant starting values filled in (a chosen column made only of them is still hidden); hand-picked cells
 * are hidden whatever they hold.
 */
export function selectMasks(cells: MaskableCell[], config: StudyConfig, seed: number): Set<string> {
  if (config.outputOnly) return new Set(cells.filter((c) => c.colId === OUTPUT_COL).map((c) => c.key))

  switch (config.maskMode) {
    case 'all':
      return new Set(worthAsking(cells).map((c) => c.key))
    case 'columns': {
      const chosen = new Set(config.columns)
      return new Set([...chosen].flatMap((id) => worthAsking(cells.filter((c) => c.colId === id)).map((c) => c.key)))
    }
    case 'cells': {
      // only keys that are questions in THIS table: a stale or forged key masks nothing
      const chosen = new Set(config.cells)
      return new Set(cells.filter((c) => chosen.has(c.key)).map((c) => c.key))
    }
    case 'random':
      return new Set(sampleShare(worthAsking(cells), config.percent, seed).map((c) => c.key))
  }
}
