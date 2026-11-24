import type { ReactNode } from 'react'

/** Bordered, rounded section with an optional title strip. */
export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-slate-300 dark:border-slate-700 ${className}`}>
      {title && (
        <h2 className="border-b border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-semibold dark:border-slate-700 dark:bg-slate-900">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
