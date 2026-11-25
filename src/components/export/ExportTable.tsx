import { Fragment, type CSSProperties } from 'react'
import { headerParts, valueWidths, type TableModel } from '../../core/export/tableModel'

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", "Courier New", monospace'

const cell: CSSProperties = { border: '1px solid #444', padding: '4px 10px', textAlign: 'left', verticalAlign: 'top', whiteSpace: 'pre' }

/**
 * A column holding anything longer than this many characters wraps at that width. Without a limit one long list
 * makes the table many times wider than it is tall, and the text is unreadable once the image or page is fitted
 * to a screen. Paper is narrower than a screen, so print wraps sooner.
 */
export const WRAP_CHARS = { image: 24, print: 16 }

/** Printable width of A4 inside the 12mm page margins, in CSS pixels. */
const PAGE_PX = { portrait: 703, landscape: 1031 }
const PRINT_FONT = { normal: 12, smallest: 8 }

/**
 * A table too wide for a portrait page is printed on a landscape one, in smaller text if that still isn't enough.
 * The width is estimated from character counts: monospace characters are about 0.6em wide.
 */
export function printLayout(model: TableModel, widths = valueWidths(model)): { landscape: boolean; fontSize: number } {
  const chars = model.columns.map((c, j) =>
    Math.max(Math.min(widths[j]!, WRAP_CHARS.print), ...headerParts(c.header, widths[j]!).map((p) => p.length)),
  )
  const text = chars.reduce((sum, n) => sum + n, 0) * 0.6
  const edges = model.columns.length * 11 + 32 // cell padding and borders, then the sheet's own padding
  const needed = text * PRINT_FONT.normal + edges
  if (needed <= PAGE_PX.portrait) return { landscape: false, fontSize: PRINT_FONT.normal }
  const fits = Math.floor(((PAGE_PX.landscape - edges) / text) * 2) / 2
  return { landscape: true, fontSize: Math.min(PRINT_FONT.normal, Math.max(PRINT_FONT.smallest, fits)) }
}

interface Props {
  model: TableModel
  /** Fill the width of the page (print) instead of the natural width (PNG). */
  fit?: boolean
  /** Column widths in characters, when `model` is one part of a bigger table. Measured from `model` otherwise. */
  widths?: number[]
}

/**
 * A plain, static, non-interactive rendering of a TableModel for PNG export and printing. Inline light styles
 * on purpose: an exam sheet is black on white whatever theme the app is in, and html-to-image needs no CSS.
 */
export function ExportTable({ model, fit = false, widths = valueWidths(model) }: Props) {
  const worksheet = model.variant === 'worksheet'
  const wrapAt = fit ? WRAP_CHARS.print : WRAP_CHARS.image
  const base: CSSProperties = fit ? { ...cell, padding: '3px 5px' } : cell
  // the width goes on a block INSIDE the cell: automatic table layout ignores a max-width on the cell itself
  const wrapped: CSSProperties = { width: `${wrapAt}ch`, maxWidth: fit ? '100%' : undefined, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }
  const page = fit ? printLayout(model, widths) : null
  return (
    <div
      className={page?.landscape ? 'export-table print-landscape' : 'export-table'}
      style={{ background: '#fff', color: '#111', padding: 16, fontFamily: FONT, fontSize: page?.fontSize ?? 14, width: fit ? '100%' : 'max-content' }}
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
            {model.columns.map((c, j) => (
              <th key={c.id} scope="col" style={{ ...base, background: '#e8e8e8', fontWeight: 700 }}>
                {headerParts(c.header, widths[j]!).map((part, k) => (
                  <Fragment key={k}>
                    {k > 0 && <br />}
                    {part}
                  </Fragment>
                ))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, i) => (
            // a worksheet's blank cells need room to write in
            <tr key={i} style={worksheet ? { height: '2.2em' } : undefined}>
              {row.map((text, j) => (
                <td key={j} style={{ ...base, minWidth: worksheet ? '5em' : undefined }}>
                  {widths[j]! > wrapAt && text !== '' ? <div style={wrapped}>{text}</div> : text}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
