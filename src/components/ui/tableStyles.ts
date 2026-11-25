/** Shared data-table class strings (from the trace table). */
export const TABLE = 'w-full border-collapse text-sm'
export const THEAD = 'sticky top-0 z-10 bg-surface-strong'
/** `projector:` is 135 % of `text-sm`, with room around it. It only ever applies on the trace page. */
const PROJECTOR_CELL = 'projector:px-4 projector:py-2 projector:text-[1.18rem]'
export const TH = `border border-border px-3 py-1.5 text-left font-semibold tabular-nums ${PROJECTOR_CELL}`
export const TD = `border border-border px-3 py-1 font-mono tabular-nums ${PROJECTOR_CELL}`
