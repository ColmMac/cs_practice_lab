import { MIME } from '../../core/export/download'
import { toJson } from '../../core/export/json'
import { exportBaseName } from '../../core/export/tableModel'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { Button } from '../ui/Button'
import { EXPORT_ROW, ExportPanel, ExportUnavailable, ExportVariantPicker } from '../ui/ExportPanel'
import { useExportData } from './useExportData'

/** Copy / download the visible table as Markdown, CSV, LaTeX, JSON or PNG, or print it. Needs a table to exist. */
export function ExportMenu() {
  const result = useStore((s) => s.result)
  const inChallenge = useStore((s) => s.challenge !== null)
  if (inChallenge) return <ExportUnavailable reason="Exports are off during a challenge" />
  if (!result || result.steps.length === 0) return <ExportUnavailable reason="Run a program that produces a table first" />
  return <ExportMenuFor result={result} />
}

function ExportMenuFor({ result }: { result: TraceResult }) {
  const { exportOptions, setExportOptions } = useStore()
  const ranInput = useStore((s) => s.ranInput)
  const { table, maskedCount, options } = useExportData(result)
  const setPrintJob = useStore((s) => s.setPrintJob)
  const printPack = () => {
    setPrintJob('pack')
    window.print()
  }
  const baseName = exportBaseName(table.variant)
  const json = () =>
    toJson({
      result,
      code: ranInput?.code ?? '',
      stdin: ranInput?.stdin ?? [],
      language: result.language,
      granularity: options.granularity,
      display: options.display,
      variant: table.variant,
      table,
    })

  return (
    <ExportPanel
      table={table}
      baseName={baseName}
      controls={
        <>
          <ExportVariantPicker
            value={exportOptions.variant}
            onChange={(variant) => setExportOptions({ variant })}
            blanked={maskedCount}
            nothingBlanked="Nothing is blanked yet: open Study mode and choose what to hide."
          />
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={exportOptions.includeCode} onChange={(e) => setExportOptions({ includeCode: e.target.checked })} />
            Include the program (Markdown, LaTeX, PNG, print)
          </label>
        </>
      }
      extras={({ save }) => (
        <li className={EXPORT_ROW}>
          <span>JSON</span>
          <Button variant="small" onClick={() => save(`${baseName}.json`, json(), MIME.json)}>
            Download .json
          </Button>
        </li>
      )}
      trailing={() => (
        <>
          <li className={EXPORT_ROW}>
            <span>Paper / PDF</span>
            <Button variant="small" onClick={() => window.print()}>
              Print…
            </Button>
          </li>
          <li className="border-t border-slate-200 pt-2 dark:border-slate-700">
            <Button variant="small" onClick={printPack}>
              Print worksheet + answer key
            </Button>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              The program with a blank grid, then the mark scheme on a new page.
            </p>
            <label className="mt-1 flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={exportOptions.packStudyBlanks}
                onChange={(e) => setExportOptions({ packStudyBlanks: e.target.checked })}
              />
              Use the Study mode blanks on the worksheet
            </label>
            {exportOptions.packStudyBlanks && maskedCount === 0 && (
              <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                Study mode hides nothing yet, so the whole grid will be blank.
              </p>
            )}
          </li>
        </>
      )}
    />
  )
}
