import type { ColumnId, Value } from '../types'

/** all: every maskable cell · random: a seeded percentage of them · columns: only the chosen columns · cells: hand-picked. */
export type MaskMode = 'all' | 'random' | 'columns' | 'cells'

export interface StudyConfig {
  maskMode: MaskMode
  /** 0–100; used by `random`. */
  percent: number
  /** Used by `columns`. */
  columns: ColumnId[]
  /** Used by `cells`: cell keys (`stepIndex:columnId`) chosen by hand. At most MAX_MASK_CELLS. */
  cells: string[]
  /** Shortcut: mask only the Output column, whatever the mode. */
  outputOnly: boolean
  /** Marks for an answer that is right apart from a classic slip (3 vs 3.0, 'hi' without quotes…). */
  closeCredit: 0 | 0.5
}

export const DEFAULT_STUDY_CONFIG: StudyConfig = {
  maskMode: 'all',
  percent: 50,
  columns: [],
  cells: [],
  outputOnly: false,
  closeCredit: 0.5,
}

export const MAX_MASK_CELLS = 300

export type GradeState = 'correct' | 'close' | 'incorrect'

export interface Grade {
  state: GradeState
  /** Why it is "close" (names the slip), or what is wrong. Never contains the answer. */
  message?: string
}

/** What a masked cell should contain. */
export type Truth = { kind: 'value'; value: Value } | { kind: 'output'; text: string }

/** Identifies a cell by the trace step it belongs to (stable) and its column. */
export const cellKey = (stepIndex: number, colId: ColumnId): string => `${stepIndex}:${colId}`
