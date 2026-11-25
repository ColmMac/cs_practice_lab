import { useMemo } from 'react'
import type { RowOptions } from '../../core/derive/rows'
import { buildTableModel, type TableModel } from '../../core/export/tableModel'
import { maskableCells, selectMasks } from '../../core/study/mask'
import type { ColumnDef, TraceResult, TraceRow } from '../../core/types'
import { useStore } from '../../store'
import { useTableData } from '../table/useTableData'

export interface ExportData {
  table: TableModel
  /** The cells the worksheet blanks (the study mask), and how many there are. */
  masked: ReadonlySet<string>
  maskedCount: number
  /** The rows and columns as shown. */
  columns: ColumnDef[]
  rows: TraceRow[]
  /** Granularity / display style of the table being exported. */
  options: RowOptions
}

/**
 * The visible table as an exportable model. The program and input come from what PRODUCED the result (not the
 * editor, which may have been edited since). A worksheet blanks the study mask: the running session's if there is
 * one, otherwise the mask the saved study settings would produce.
 */
export function useExportData(result: TraceResult): ExportData {
  const { columns, rows, model, options } = useTableData(result)
  const { variant, includeCode } = useStore((s) => s.exportOptions)
  const ranCode = useStore((s) => s.ranInput?.code ?? '')
  const studyConfig = useStore((s) => s.studyConfig)
  const studySeed = useStore((s) => s.studySeed)

  const masked = useMemo(
    () => model?.maskedKeys ?? selectMasks(maskableCells(rows, columns), studyConfig, studySeed),
    [model, rows, columns, studyConfig, studySeed],
  )
  const table = useMemo(
    () => buildTableModel(columns, rows, { variant, masked, includeCode, code: ranCode, codeLanguage: result.language }),
    [columns, rows, variant, masked, includeCode, ranCode, result.language],
  )
  return { table, masked, maskedCount: masked.size, columns, rows, options }
}
