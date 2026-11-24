import type { AlgorithmId, Run } from './types'

export interface HistoryColumn {
  id: string
  header: string
}

export interface HistoryRow {
  cells: string[]
  /** Index into `buildFrames(run)` of the frame where this row's result appears (0 = the start). */
  frame: number
}

/** The pass-by-pass table: the array after each pass (sorts) or one row per probe (searches). */
export interface HistoryTable {
  algo: AlgorithmId
  /** `pass`: a row is a whole pass, current while the pass is under way. `probe`: a row is one look, current just after it. */
  kind: 'pass' | 'probe'
  title: string
  columns: HistoryColumn[]
  rows: HistoryRow[]
}

const NAMES: Record<AlgorithmId, string> = {
  bubble: 'Bubble sort',
  insertion: 'Insertion sort',
  merge: 'Merge sort',
  linear: 'Linear search',
  binary: 'Binary search',
}

const sortHistory = (run: Run): HistoryTable => {
  const n = run.input.length
  const moveHeader = run.algo === 'bubble' ? 'Swaps' : run.algo === 'insertion' ? 'Shifts' : null
  const passHeader = run.algo === 'merge' ? 'Level' : 'Pass'
  const columns: HistoryColumn[] = [
    { id: 'pass', header: passHeader },
    ...Array.from({ length: n }, (_, i) => ({ id: `i${i}`, header: `[${i}]` })),
    { id: 'compares', header: 'Compares' },
    ...(moveHeader ? [{ id: 'moves', header: moveHeader }] : []),
  ]
  const extra = (compares: string, moves: string): string[] => [compares, ...(moveHeader ? [moves] : [])]

  const rows: HistoryRow[] = [{ cells: ['Start', ...run.input.map(String), ...extra('', '')], frame: 0 }]
  let compares = 0
  let moves = 0
  run.steps.forEach((s, k) => {
    if (s.kind === 'compare') compares++
    else if ((run.algo === 'bubble' && s.kind === 'swap') || (run.algo === 'insertion' && s.kind === 'shift')) moves++
    else if (s.kind === 'pass-end') {
      rows.push({ cells: [String(s.pass), ...s.array.map(String), ...extra(String(compares), String(moves))], frame: k + 1 })
      compares = 0
      moves = 0
    }
  })
  return { algo: run.algo, kind: 'pass', title: `${NAMES[run.algo]}: the array after each ${run.algo === 'merge' ? 'level' : 'pass'}`, columns, rows }
}

const linearHistory = (run: Run): HistoryTable => {
  const rows: HistoryRow[] = []
  run.steps.forEach((s, k) => {
    if (s.kind === 'inspect') {
      rows.push({
        cells: [String(rows.length + 1), String(s.i), String(s.value), s.match ? 'Match: found' : `Not ${run.target}: move on`],
        frame: k + 1,
      })
    } else if (s.kind === 'not-found') {
      rows.push({ cells: ['', '', '', 'End of list: not found'], frame: k + 1 })
    }
  })
  return {
    algo: 'linear',
    kind: 'probe',
    title: `Linear search for ${run.target}: each item looked at`,
    columns: [
      { id: 'look', header: 'Look' },
      { id: 'index', header: 'Index' },
      { id: 'value', header: 'Value' },
      { id: 'result', header: 'Result' },
    ],
    rows,
  }
}

const binaryHistory = (run: Run): HistoryTable => {
  const rows: HistoryRow[] = []
  let low = 0
  let high = run.input.length - 1
  run.steps.forEach((s, k) => {
    if (s.kind === 'range') {
      const result =
        s.relation === 'equal'
          ? 'Equal: found'
          : s.relation === 'less'
            ? `${s.value} < ${run.target}: search right`
            : `${s.value} > ${run.target}: search left`
      rows.push({ cells: [String(rows.length + 1), String(s.low), String(s.mid), String(s.high), String(s.value), result], frame: k + 1 })
      low = s.relation === 'less' ? s.mid + 1 : s.low
      high = s.relation === 'greater' ? s.mid - 1 : s.high
    } else if (s.kind === 'not-found') {
      rows.push({ cells: ['', String(low), '', String(high), '', 'Low is past high: not found'], frame: k + 1 })
    }
  })
  return {
    algo: 'binary',
    kind: 'probe',
    title: `Binary search for ${run.target}: low, mid and high at each probe`,
    columns: [
      { id: 'probe', header: 'Probe' },
      { id: 'low', header: 'Low' },
      { id: 'mid', header: 'Mid' },
      { id: 'high', header: 'High' },
      { id: 'value', header: 'Value at mid' },
      { id: 'result', header: 'Result' },
    ],
    rows,
  }
}

/** The pass-by-pass (or probe-by-probe) table for a run. Pure: built from the run's own steps. */
export const buildHistory = (run: Run): HistoryTable =>
  run.algo === 'linear' ? linearHistory(run) : run.algo === 'binary' ? binaryHistory(run) : sortHistory(run)

/**
 * The row to highlight at a given frame, or -1 for none. A sort's row is current while its pass is being
 * worked on (so the Start row at frame 0); a search's row is current once its probe has been made.
 */
export const currentHistoryRow = (table: HistoryTable, frame: number): number => {
  const { rows } = table
  if (rows.length === 0) return -1
  if (table.kind === 'pass') {
    const i = rows.findIndex((r) => r.frame >= frame)
    return i === -1 ? rows.length - 1 : i
  }
  let cur = -1
  rows.forEach((r, i) => {
    if (r.frame <= frame) cur = i
  })
  return cur
}
