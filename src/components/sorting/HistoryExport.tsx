import { useMemo } from 'react'
import type { HistoryTable } from '../../core/algorithms'
import { buildHistoryModel, historyBaseName } from '../../core/export/historyModel'
import { ExportPanel } from '../ui/ExportPanel'

/** Export for the pass-by-pass table (the whole table, however far the visualiser has got). */
export function HistoryExport({ table }: { table: HistoryTable }) {
  const model = useMemo(() => buildHistoryModel(table), [table])
  return <ExportPanel table={model} baseName={historyBaseName(table)} />
}
