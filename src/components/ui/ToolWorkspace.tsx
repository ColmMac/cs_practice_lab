import type { ReactNode } from 'react'

/**
 * A tool's header and working area. On wide screens it is at least as tall as the space under the nav, so whatever
 * follows it in the document (guide, ad, footer) starts below the fold. It grows with its content: the page scrolls.
 * The trace page does not use this: its workspace has a FIXED height, because its columns scroll inside it (App.tsx).
 */
export function ToolWorkspace({ children }: { children: ReactNode }) {
  return <div className="flex flex-col lg:min-h-[calc(100dvh-var(--nav-h))]">{children}</div>
}
