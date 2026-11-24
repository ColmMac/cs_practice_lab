import { useMemo } from 'react'
import { resolveColumns } from '../../core/derive/columns'
import type { ColumnDef, TraceResult } from '../../core/types'
import { useStore } from '../../store'

/**
 * `all`: every column that could be shown (what the Column Manager lists, in the user's order).
 * `visible`: the ones actually shown in the table.
 */
export function useColumns(result: TraceResult): { all: ColumnDef[]; visible: ColumnDef[] } {
  const watches = useStore((s) => s.watches)
  const showEphemeral = useStore((s) => s.showEphemeral)
  const showCondition = useStore((s) => s.showCondition)
  const hidden = useStore((s) => s.hiddenColumns)
  const order = useStore((s) => s.columnOrder)

  return useMemo(
    () => resolveColumns(result, { showEphemeral, showCondition, watches, hidden, order }),
    [result, watches, showEphemeral, showCondition, hidden, order],
  )
}
