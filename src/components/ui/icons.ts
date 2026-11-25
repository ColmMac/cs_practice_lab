/**
 * Sizes for lucide icons that sit beside a text label. They scale with the text (projector mode enlarges it) and
 * are inline, so a button needs no flex layout. Every icon is `aria-hidden`: the label is the accessible name.
 */
const INLINE = 'inline-block size-[1em] shrink-0 align-[-0.125em]'
export const ICON_BEFORE = `${INLINE} mr-1.5`
export const ICON_AFTER = `${INLINE} ml-1`
