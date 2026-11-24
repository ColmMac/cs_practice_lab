import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { useStore } from '../../store'
import { ExportTable } from './ExportTable'
import { useExportData } from './useExportData'

function PrintContent() {
  const result = useStore((s) => s.result)
  if (!result || result.steps.length === 0) return null
  return <PrintTable />
}

function PrintTable() {
  const result = useStore((s) => s.result)!
  const { table } = useExportData(result)
  return <ExportTable model={table} fit />
}

/**
 * What the browser prints. It is only built while a print is happening (`beforeprint` → render, `afterprint` →
 * remove), so it costs nothing the rest of the time and also works for Ctrl/⌘+P, not just our button. The print
 * stylesheet hides the rest of the app and shows only this.
 */
export function PrintRegion() {
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    // flushSync: the DOM must be ready before the browser takes its print snapshot
    const before = () => flushSync(() => setPrinting(true))
    const after = () => setPrinting(false)
    window.addEventListener('beforeprint', before)
    window.addEventListener('afterprint', after)
    return () => {
      window.removeEventListener('beforeprint', before)
      window.removeEventListener('afterprint', after)
    }
  }, [])
  return (
    <div className="print-region hidden print:block" data-testid="print-region">
      {printing && <PrintContent />}
    </div>
  )
}
