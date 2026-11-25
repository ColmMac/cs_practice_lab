import { toPng } from 'html-to-image'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { valueWidths, type TableModel } from '../../core/export/tableModel'
import { ExportTable } from './ExportTable'

/** Pixel density of the exported image: 3× is sharp when pasted into a document or printed. */
export const PNG_PIXEL_RATIO = 3

/**
 * The tallest table that goes in one image, in CSS pixels. Browsers limit a canvas to about 16,384 px a side and
 * html-to-image silently shrinks anything bigger to fit, so a long trace in one image ends up too small to read.
 * At this height an image still has at least 2 pixels per CSS pixel.
 */
export const PNG_MAX_HEIGHT = 8000

const CANVAS_LIMIT = 16384

/**
 * Splits rows into consecutive [start, end) runs, each fitting `budget` pixels. A row taller than the budget gets
 * a run to itself.
 */
export function splitRows(heights: number[], budget: number): [number, number][] {
  const parts: [number, number][] = []
  let start = 0
  let used = 0
  heights.forEach((h, i) => {
    if (i > start && used + h > budget) {
      parts.push([start, i])
      start = i
      used = 0
    }
    used += h
  })
  parts.push([start, heights.length])
  return parts
}

/**
 * Renders the table off-screen (outside the viewport but laid out, which html-to-image needs) and returns it as
 * PNG data URLs: one, or several when the table is too tall for a single sharp image. The whole table is
 * rendered, not just the rows currently scrolled into view. Every part repeats the header row.
 */
export async function renderPng(model: TableModel): Promise<string[]> {
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:fixed;left:-100000px;top:0;pointer-events:none;'
  document.body.appendChild(host)
  const root = createRoot(host)
  // from the whole table, so every part wraps the same columns
  const widths = valueWidths(model)
  const draw = (part: TableModel): HTMLElement => {
    flushSync(() => root.render(<ExportTable model={part} widths={widths} />))
    return host.firstElementChild as HTMLElement
  }
  const capture = (node: HTMLElement) => {
    // never denser than the canvas allows, so we choose the size rather than the library
    const longest = Math.max(node.offsetWidth, node.offsetHeight, 1)
    return toPng(node, { pixelRatio: Math.min(PNG_PIXEL_RATIO, CANVAS_LIMIT / longest), backgroundColor: '#ffffff' })
  }
  try {
    const whole = draw(model)
    if (whole.offsetHeight <= PNG_MAX_HEIGHT) return [await capture(whole)]

    const heights = [...whole.querySelectorAll<HTMLElement>('tbody tr')].map((tr) => tr.offsetHeight)
    // title, program, header row and padding: counted for every part, though only the first has the program
    const overhead = whole.offsetHeight - heights.reduce((sum, h) => sum + h, 0)
    const parts = splitRows(heights, Math.max(PNG_MAX_HEIGHT - overhead, 1))
    const images: string[] = []
    for (const [i, [start, end]] of parts.entries()) {
      images.push(
        await capture(
          draw({
            ...model,
            title: `${model.title} (part ${i + 1} of ${parts.length})`,
            rows: model.rows.slice(start, end),
            ...(i > 0 ? { code: undefined, inputs: undefined } : {}),
          }),
        ),
      )
    }
    return images
  } finally {
    root.unmount()
    host.remove()
  }
}
