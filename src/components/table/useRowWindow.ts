import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useState } from 'react'
import { useProjector } from '../ui/projector'

/** Tables up to this many rows are rendered in full; longer ones are windowed. */
export const VIRTUALISE_ABOVE = 300
const ROW_ESTIMATE = 33
const PROJECTOR_ROW_ESTIMATE = 45
const OVERSCAN = 15

/** Layout numbers for rendering. Kept apart from the ref callbacks so reading them during render is plainly safe. */
export interface RowWindowView {
  /** True when only a window of the rows is rendered. */
  active: boolean
  /** Indices to render, or null to render them all. */
  indices: number[] | null
  /** Height standing in for the rows above / below the window. */
  padTop: number
  padBottom: number
}

/** Callback refs to attach: one to the <tbody>, one to each rendered row (so rows of unequal height are measured). */
export interface RowWindowRefs {
  body: (el: HTMLTableSectionElement | null) => void
  row: (el: Element | null) => void
}

/**
 * Renders only the rows near the viewport of long tables (a 1,000-line trace is 1,000 rows × several cells).
 * The scroll container is the nearest `[data-scroll-parent]`: it also holds the controls and banners ABOVE the
 * table, so the table body starts some way down inside it; that offset is the virtualiser's `scrollMargin`.
 */
export function useRowWindow(count: number, enabled: boolean): { view: RowWindowView; refs: RowWindowRefs } {
  const [body, setBody] = useState<HTMLTableSectionElement | null>(null)
  const [margin, setMargin] = useState(0)
  const projector = useProjector((s) => s.on)
  const scrollEl = enabled ? (body?.closest<HTMLElement>('[data-scroll-parent]') ?? null) : null

  // Re-measure after EVERY render: anything above the table (a banner, the study toolbar) moves it. This cannot
  // loop: the state only changes when the offset really changed, and then it settles.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    if (!enabled || !scrollEl || !body) return
    const top = body.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop
    setMargin((prev) => (Math.abs(prev - top) < 1 ? prev : Math.round(top)))
  })

  // TanStack's hook returns functions React Compiler can't memoise safely; that is fine here (documented limitation).
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: scrollEl ? count : 0,
    getScrollElement: () => scrollEl,
    estimateSize: () => (projector ? PROJECTOR_ROW_ESTIMATE : ROW_ESTIMATE),
    overscan: OVERSCAN,
    scrollMargin: margin,
  })

  // Projector mode changes every row's height: forget the old measurements (rows on screen report their new size).
  useEffect(() => virtualizer.measure(), [virtualizer, projector])

  const refs: RowWindowRefs = { body: setBody, row: virtualizer.measureElement }
  if (!scrollEl) return { view: { active: false, indices: null, padTop: 0, padBottom: 0 }, refs }

  const items = virtualizer.getVirtualItems()
  const first = items[0]
  const last = items[items.length - 1]
  return {
    view: {
      active: true,
      indices: items.map((i) => i.index),
      padTop: first ? first.start - margin : 0,
      padBottom: last ? virtualizer.getTotalSize() - (last.end - margin) : 0,
    },
    refs,
  }
}
