import { useId, useState } from 'react'
import { CSV_BOM, toCsv } from '../../core/export/csv'
import { copyText, dataUrlToBlob, downloadBlob, downloadText, MIME } from '../../core/export/download'
import { toJson } from '../../core/export/json'
import { toLatex } from '../../core/export/latex'
import { toMarkdown } from '../../core/export/markdown'
import { exportBaseName, type ExportVariant } from '../../core/export/tableModel'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { usePopover } from '../layout/usePopover'
import { Segmented } from '../table/Segmented'
import { renderPng } from './png'
import { useExportData } from './useExportData'

const trigger =
  'rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800'
const small =
  'rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'

/** Copy / download the visible table as Markdown, CSV, LaTeX, JSON or PNG, or print it. Needs a table to exist. */
export function ExportMenu() {
  const result = useStore((s) => s.result)
  if (!result || result.steps.length === 0) {
    return (
      <button type="button" disabled className={trigger} title="Run a program that produces a table first">
        ⇩ Export
      </button>
    )
  }
  return <ExportMenuFor result={result} />
}

function ExportMenuFor({ result }: { result: TraceResult }) {
  const { open, setOpen, ref } = usePopover()
  const panelId = useId()
  const { exportOptions, setExportOptions } = useStore()
  const ranInput = useStore((s) => s.ranInput)
  const { table, maskedCount, options } = useExportData(result)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const base = exportBaseName(table.variant)

  const copy = async (what: string, text: string) => {
    setMessage((await copyText(text)) ? `${what} copied to the clipboard.` : `Couldn’t copy ${what}: the browser blocked clipboard access. Use Download instead.`)
  }
  const save = (filename: string, text: string, mime: string) => {
    downloadText(filename, text, mime)
    setMessage(`Saved ${filename}.`)
  }
  const savePng = async () => {
    setBusy(true)
    setMessage('Creating the image…')
    try {
      downloadBlob(`${base}.png`, dataUrlToBlob(await renderPng(table)))
      setMessage(`Saved ${base}.png.`)
    } catch {
      setMessage('Couldn’t create the image. Try the other formats, or Print and choose Save as PDF.')
    } finally {
      setBusy(false)
    }
  }
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

  const row = 'flex items-center justify-between gap-2'
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          setOpen((o) => !o)
          setMessage(null)
        }}
        className={trigger}
      >
        ⇩ Export
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Export"
          className="absolute right-0 z-30 mt-1 w-80 rounded border border-slate-300 bg-white p-3 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
            Exports the table exactly as it is shown now (same columns, rows and cell style).
          </p>
          <Segmented<ExportVariant>
            label="As"
            value={exportOptions.variant}
            onChange={(variant) => setExportOptions({ variant })}
            options={[
              { value: 'key', label: 'Answer key', hint: 'Every value filled in' },
              { value: 'worksheet', label: 'Worksheet', hint: 'The cells a student fills in are left blank' },
            ]}
          />
          {exportOptions.variant === 'worksheet' && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {maskedCount === 0
                ? 'Nothing is blanked yet: open Study mode and choose what to hide.'
                : `Blanks ${maskedCount} cell${maskedCount === 1 ? '' : 's'} (the Study mode mask).`}
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={exportOptions.includeCode} onChange={(e) => setExportOptions({ includeCode: e.target.checked })} />
            Include the program (Markdown, LaTeX, PNG, print)
          </label>

          <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
            <li className={row}>
              <span>Markdown</span>
              <span className="flex gap-1">
                <button type="button" className={small} onClick={() => copy('Markdown', toMarkdown(table))}>
                  Copy
                </button>
                <button type="button" className={small} onClick={() => save(`${base}.md`, toMarkdown(table), MIME.markdown)}>
                  Download .md
                </button>
              </span>
            </li>
            <li className={row}>
              <span>CSV</span>
              <button type="button" className={small} onClick={() => save(`${base}.csv`, CSV_BOM + toCsv(table), MIME.csv)}>
                Download .csv
              </button>
            </li>
            <li className={row}>
              <span>LaTeX</span>
              <span className="flex gap-1">
                <button type="button" className={small} onClick={() => copy('LaTeX table', toLatex(table))}>
                  Copy table
                </button>
                <button type="button" className={small} onClick={() => save(`${base}.tex`, toLatex(table, { standalone: true }), MIME.latex)}>
                  Download .tex
                </button>
              </span>
            </li>
            <li className={row}>
              <span>JSON</span>
              <button type="button" className={small} onClick={() => save(`${base}.json`, json(), MIME.json)}>
                Download .json
              </button>
            </li>
            <li className={row}>
              <span>Image</span>
              <button type="button" className={small} onClick={() => void savePng()} disabled={busy}>
                Download .png
              </button>
            </li>
            <li className={row}>
              <span>Paper / PDF</span>
              <button type="button" className={small} onClick={() => window.print()}>
                Print…
              </button>
            </li>
          </ul>

          <p role="status" className="mt-3 min-h-[1rem] text-xs text-slate-700 dark:text-slate-300">
            {message}
          </p>
        </div>
      )}
    </div>
  )
}
