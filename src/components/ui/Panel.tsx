import type { ReactNode } from 'react'

/** Bordered, rounded section with an optional title strip. */
export function Panel({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded border border-border ${className}`}>
      {title && (
        <h2 className="border-b border-border bg-surface px-3 py-1.5 text-sm font-semibold">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
}
