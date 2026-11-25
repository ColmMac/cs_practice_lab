import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { ExportTable } from './ExportTable'
import { PrintPack } from './PrintPack'
import { useExportData } from './useExportData'

function PrintContent() {
  const result = useStore((s) => s.result)
  // checked here too, not just on the menu: Ctrl/⌘+P never goes through it
  const inChallenge = useStore((s) => s.challenge !== null)
  if (inChallenge) return <p>Printing is off during a challenge.</p>
  if (!result || result.steps.length === 0) return null
  return <PrintResult result={result} />
}

function PrintResult({ result }: { result: TraceResult }) {
  const pack = useStore((s) => s.printJob === 'pack')
  return pack ? <PrintPack result={result} /> : <PrintTable result={result} />
}

function PrintTable({ result }: { result: TraceResult }) {
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
    const after = () => {
      setPrinting(false)
      useStore.getState().setPrintJob('table') // Ctrl/⌘+P afterwards prints the ordinary table again
    }
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
