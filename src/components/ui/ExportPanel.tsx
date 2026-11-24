import { useState, type ReactNode } from 'react'
import { renderPng } from '../export/png'
import { CSV_BOM, toCsv } from '../../core/export/csv'
import { copyText, dataUrlToBlob, downloadBlob, downloadText, MIME } from '../../core/export/download'
import { toLatex } from '../../core/export/latex'
import { toMarkdown } from '../../core/export/markdown'
import type { TableModel } from '../../core/export/tableModel'
import { Button } from './Button'
import { Popover } from './Popover'

/** What a slot can do: save a text file or copy text, reporting the outcome in the panel's status line. */
export interface ExportApi {
  save: (filename: string, text: string, mime: string) => void
  copy: (what: string, text: string) => Promise<void>
}

interface Props {
  table: TableModel
  /** File name without extension: `trace-table`, `truth-table-worksheet`. */
  baseName: string
  /** Options for this tool (variant, include the program…), shown above the format list. */
  controls?: ReactNode
  /** Extra `<li>` rows between LaTeX and Image (the trace page's JSON). */
  extras?: (api: ExportApi) => ReactNode
  /** Extra `<li>` rows after Image (the trace page's Print). */
  trailing?: (api: ExportApi) => ReactNode
}

const ROW = 'flex items-center justify-between gap-2'

/**
 * Tool-agnostic export popover: Markdown, CSV, LaTeX and PNG of any `TableModel`. A tool adds its own options
 * (`controls`) and formats (`extras`, `trailing`).
 */
export function ExportPanel({ table, baseName, controls, extras, trailing }: Props) {
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const api: ExportApi = {
    copy: async (what, text) => {
      setMessage((await copyText(text)) ? `${what} copied to the clipboard.` : `Couldn’t copy ${what}: the browser blocked clipboard access. Use Download instead.`)
    },
    save: (filename, text, mime) => {
      downloadText(filename, text, mime)
      setMessage(`Saved ${filename}.`)
    },
  }
  const { copy, save } = api
  const savePng = async () => {
    setBusy(true)
    setMessage('Creating the image…')
    try {
      downloadBlob(`${baseName}.png`, dataUrlToBlob(await renderPng(table)))
      setMessage(`Saved ${baseName}.png.`)
    } catch {
      setMessage('Couldn’t create the image. Try the other formats, or Print and choose Save as PDF.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Popover
      label="Export"
      onToggle={() => setMessage(null)}
      trigger={(p) => (
        <Button {...p}>
          ⇩ Export
        </Button>
      )}
    >
      <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">
        Exports the table exactly as it is shown now (same columns, rows and cell style).
      </p>
      {controls}

      <ul className="mt-3 space-y-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <li className={ROW}>
          <span>Markdown</span>
          <span className="flex gap-1">
            <Button variant="small" onClick={() => void copy('Markdown', toMarkdown(table))}>
              Copy
            </Button>
            <Button variant="small" onClick={() => save(`${baseName}.md`, toMarkdown(table), MIME.markdown)}>
              Download .md
            </Button>
          </span>
        </li>
        <li className={ROW}>
          <span>CSV</span>
          <Button variant="small" onClick={() => save(`${baseName}.csv`, CSV_BOM + toCsv(table), MIME.csv)}>
            Download .csv
          </Button>
        </li>
        <li className={ROW}>
          <span>LaTeX</span>
          <span className="flex gap-1">
            <Button variant="small" onClick={() => void copy('LaTeX table', toLatex(table))}>
              Copy table
            </Button>
            <Button variant="small" onClick={() => save(`${baseName}.tex`, toLatex(table, { standalone: true }), MIME.latex)}>
              Download .tex
            </Button>
          </span>
        </li>
        {extras?.(api)}
        <li className={ROW}>
          <span>Image</span>
          <Button variant="small" onClick={() => void savePng()} disabled={busy}>
            Download .png
          </Button>
        </li>
        {trailing?.(api)}
      </ul>

      <p role="status" className="mt-3 min-h-[1rem] text-xs text-slate-700 dark:text-slate-300">
        {message}
      </p>
    </Popover>
  )
}

/** The disabled trigger shown while there is nothing to export. */
export function ExportUnavailable({ reason }: { reason: string }) {
  return (
    <Button disabled title={reason}>
      ⇩ Export
    </Button>
  )
}

export { ROW as EXPORT_ROW }
