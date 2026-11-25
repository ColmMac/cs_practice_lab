import { useMemo } from 'react'
import { buildPrintPack } from '../../core/export/tableModel'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { ExportTable } from './ExportTable'
import { useExportData } from './useExportData'

/**
 * "Print worksheet + answer key": the student's grid, a forced page break, then the mark scheme. Built from the same
 * table as the screen, and from the program and input that PRODUCED it.
 */
export function PrintPack({ result }: { result: TraceResult }) {
  const { columns, rows, masked } = useExportData(result)
  const ranInput = useStore((s) => s.ranInput)
  const useStudyBlanks = useStore((s) => s.exportOptions.packStudyBlanks)
  const pack = useMemo(
    () =>
      buildPrintPack(columns, rows, {
        masked,
        useStudyBlanks,
        code: ranInput?.code ?? '',
        codeLanguage: result.language,
        inputs: ranInput?.stdin,
      }),
    [columns, rows, masked, useStudyBlanks, ranInput, result.language],
  )
  return (
    <>
      <section data-print-page="worksheet" className="print-page-break">
        <ExportTable model={pack.worksheet} fit />
      </section>
      <section data-print-page="key">
        <ExportTable model={pack.key} fit />
      </section>
    </>
  )
}
