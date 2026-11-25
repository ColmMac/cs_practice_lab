import type { CSSProperties } from 'react'
import type { TableModel } from '../../core/export/tableModel'

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace'

const cell: CSSProperties = { border: '1px solid #444', padding: '4px 10px', textAlign: 'left', verticalAlign: 'top', whiteSpace: 'pre' }

interface Props {
  model: TableModel
  /** Fill the width of the page (print) instead of the natural width (PNG). */
  fit?: boolean
}

/**
 * A plain, static, non-interactive rendering of a TableModel for PNG export and printing. Inline light styles
 * on purpose: an exam sheet is black on white whatever theme the app is in, and html-to-image needs no CSS.
 */
export function ExportTable({ model, fit = false }: Props) {
  const worksheet = model.variant === 'worksheet'
  return (
    <div
      className="export-table"
      style={{ background: '#fff', color: '#111', padding: 16, fontFamily: FONT, fontSize: 14, width: fit ? '100%' : 'max-content' }}
    >
      <h2 style={{ fontSize: 16, margin: '0 0 8px', fontFamily: 'system-ui, sans-serif' }}>{model.title}</h2>
      {model.code && (
        <pre style={{ margin: '0 0 12px', padding: 8, border: '1px solid #bbb', background: '#f6f6f6', fontSize: 13, whiteSpace: 'pre-wrap' }}>
          {model.code}
        </pre>
      )}
      {model.inputs && (
        <div style={{ margin: '0 0 12px' }}>
          <p style={{ margin: '0 0 4px', fontFamily: 'system-ui, sans-serif' }}>Program inputs, in order:</p>
          <pre style={{ margin: 0, padding: 8, border: '1px solid #bbb', fontSize: 13, whiteSpace: 'pre-wrap' }}>
            {model.inputs.join('\n')}
          </pre>
        </div>
      )}
      <table style={{ borderCollapse: 'collapse', width: fit ? '100%' : undefined }}>
        <thead>
          <tr>
            {model.columns.map((c) => (
              <th key={c.id} scope="col" style={{ ...cell, background: '#e8e8e8', fontWeight: 700 }}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, i) => (
            // a worksheet's blank cells need room to write in
            <tr key={i} style={worksheet ? { height: '2.2em' } : undefined}>
              {row.map((text, j) => (
                <td key={j} style={{ ...cell, minWidth: worksheet ? '5em' : undefined }}>
                  {text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
