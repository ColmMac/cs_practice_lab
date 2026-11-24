import type { ReactNode } from 'react'

/** The strip across the top of a tool: its title, then a toolbar. */
export function ToolHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
      <h1 className="mr-2 text-base font-semibold">{title}</h1>
      {children}
    </header>
  )
}
