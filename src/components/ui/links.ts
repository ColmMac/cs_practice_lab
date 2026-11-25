const FOCUS = 'focus-visible:outline-2 focus-visible:outline-accent'

/** Class strings for links. `nav` takes one of `navActive` or `navIdle` with it. */
export const LINK_CLASSES = {
  inline: `text-accent underline ${FOCUS}`,
  footer: `rounded underline hover:text-text ${FOCUS}`,
  nav: `rounded px-2 py-1 text-sm font-medium ${FOCUS}`,
  navActive: 'bg-accent-soft text-on-accent-soft',
  navIdle: 'text-text-muted hover:bg-surface-hover hover:text-text',
} as const
