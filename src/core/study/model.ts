import type { ColumnDef, TraceResult, TraceRow, Value } from '../types'
import { deriveRows, type DisplayStyle, type Granularity } from '../derive/rows'
import { constantStarts, maskableCells, selectMasks, type MaskableCell } from './mask'
import type { StudyConfig } from './types'

/** The frozen view a study session is graded against. */
export interface StudyView {
  columns: ColumnDef[]
  granularity: Granularity
  display: DisplayStyle
  config: StudyConfig
  seed: number
}

export interface StudyModel {
  rows: TraceRow[]
  /** every question in the table */
  cells: MaskableCell[]
  /** the questions that are hidden from the student */
  masked: MaskableCell[]
  maskedKeys: Set<string>
}

/** One place that decides what the table, the masks and the answer key are, so the screen and the grader agree. */
export function buildStudyModel(result: TraceResult, view: StudyView, format: (v: Value) => string): StudyModel {
  const rows = deriveRows(result, view.columns, format, { granularity: view.granularity, display: view.display })
  const cells = maskableCells(rows, view.columns, constantStarts(result))
  const maskedKeys = selectMasks(cells, view.config, view.seed)
  return { rows, cells, masked: cells.filter((c) => maskedKeys.has(c.key)), maskedKeys }
}
