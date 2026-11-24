import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'warn' | 'ok' | 'info' | 'error'

export const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  warn: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  ok: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  info: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  error: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
}

/** A small status pill. `role="status"` so changes are announced. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-medium ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}
