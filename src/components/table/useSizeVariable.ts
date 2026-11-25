import { useCallback } from 'react'

/** One measurement of an element, published as a CSS variable on it or on an element around it. */
export interface SizeSource {
  variable: string
  size: (el: HTMLElement) => number
  host: (el: HTMLElement) => HTMLElement | null
}

/** The sticky header's height, for the table: answer boxes use it as their scroll margin. */
export const HEADER_HEIGHT: SizeSource = { variable: '--study-head', size: (el) => el.offsetHeight, host: (el) => el.closest('table') }

/** The visible width of a scrolling pane (without its scrollbar, which `100cqw` would include). */
export const PANE_WIDTH: SizeSource = { variable: '--pane-width', size: (el) => el.clientWidth, host: (el) => el }

/** A ref that keeps the variable current. `source` must be a constant. */
export function useSizeVariable(source: SizeSource) {
  return useCallback(
    (el: HTMLElement | null) => {
      const host = el && source.host(el)
      if (!el || !host) return
      const publish = () => {
        const px = source.size(el)
        if (px > 0) host.style.setProperty(source.variable, `${px}px`) // nothing laid out (hidden, tests): keep the fallback
      }
      publish()
      if (typeof ResizeObserver !== 'function') return
      const observer = new ResizeObserver(publish)
      observer.observe(el)
      return () => observer.disconnect()
    },
    [source],
  )
}
