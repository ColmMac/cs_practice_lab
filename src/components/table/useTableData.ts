import { useMemo } from 'react'
import { deriveRows, type RowOptions } from '../../core/derive/rows'
import type { StudyModel } from '../../core/study/model'
import type { ColumnDef, TraceResult, TraceRow } from '../../core/types'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { useStudyModel } from '../study/useStudyModel'
import { useColumns } from './useColumns'

export interface TableData {
  columns: ColumnDef[]
  rows: TraceRow[]
  options: RowOptions
  /** Set while a study session is running: the frozen table, questions and masks. */
  model: StudyModel | null
}

/**
 * The table exactly as the user sees it: the live columns and modes, or, during a study session, the frozen
 * ones. The screen, the exports and the print view all read this, so what you export is what you see.
 */
export function useTableData(result: TraceResult): TableData {
  const studyColumns = useStore((s) => s.study?.columns)
  const studyGranularity = useStore((s) => s.study?.granularity)
  const studyDisplay = useStore((s) => s.study?.display)
  const granularity = useStore((s) => s.granularity)
  const displayStyle = useStore((s) => s.displayStyle)
  const { visible } = useColumns(result)
  const model = useStudyModel(result)

  const columns = studyColumns ?? visible
  const options = useMemo<RowOptions>(
    () =>
      studyGranularity && studyDisplay
        ? { granularity: studyGranularity, display: studyDisplay }
        : { granularity, display: displayStyle },
    [studyGranularity, studyDisplay, granularity, displayStyle],
  )
  const rows = useMemo(
    () => model?.rows ?? deriveRows(result, columns, getLanguage(result.language).formatValue, options),
    [model, result, columns, options],
  )
  return { columns, rows, options, model }
}
