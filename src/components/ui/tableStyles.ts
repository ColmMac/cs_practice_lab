/** Shared data-table class strings (from the trace table). */
export const TABLE = 'w-full border-collapse text-sm'
export const THEAD = 'sticky top-0 z-10 bg-slate-100 dark:bg-slate-800'
/** `projector:` is 135 % of `text-sm`, with room around it. It only ever applies on the trace page. */
const PROJECTOR_CELL = 'projector:px-4 projector:py-2 projector:text-[1.18rem]'
export const TH = `border border-slate-300 px-3 py-1.5 text-left font-semibold dark:border-slate-700 ${PROJECTOR_CELL}`
export const TD = `border border-slate-300 px-3 py-1 font-mono dark:border-slate-700 ${PROJECTOR_CELL}`
