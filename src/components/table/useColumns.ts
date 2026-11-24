import { useMemo } from 'react'
import { applyColumnPrefs, deriveColumns } from '../../core/derive/columns'
import type { ColumnDef, TraceResult } from '../../core/types'
import { useStore } from '../../store'

/**
 * `all`: every column that could be shown (what the Column Manager lists, in the user's order).
 * `visible`: the ones actually shown in the table.
 */
export function useColumns(result: TraceResult): { all: ColumnDef[]; visible: ColumnDef[] } {
  const watches = useStore((s) => s.watches)
  const showEphemeral = useStore((s) => s.showEphemeral)
  const hidden = useStore((s) => s.hiddenColumns)
  const order = useStore((s) => s.columnOrder)

  return useMemo(() => {
    const derived = deriveColumns(result, { showEphemeral, watches })
    return {
      all: applyColumnPrefs(derived, { hidden: [], order }),
      visible: applyColumnPrefs(derived, { hidden, order }),
    }
  }, [result, watches, showEphemeral, hidden, order])
}
