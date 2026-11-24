import { toPng } from 'html-to-image'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { TableModel } from '../../core/export/tableModel'
import { ExportTable } from './ExportTable'

/** Pixel density of the exported image: 3× is sharp when pasted into a document or printed. */
export const PNG_PIXEL_RATIO = 3

/**
 * Renders the table off-screen (outside the viewport but laid out, which html-to-image needs) and returns it as
 * a PNG data URL. The whole table is rendered, not just the rows currently scrolled into view.
 */
export async function renderPng(model: TableModel): Promise<string> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    flushSync(() => root.render(<ExportTable model={model} />))
    const node = host.firstElementChild as HTMLElement
    return await toPng(node, { pixelRatio: PNG_PIXEL_RATIO, backgroundColor: '#ffffff' })
  } finally {
    root.unmount()
    host.remove()
  }
}
