import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'warn' | 'ok' | 'info' | 'error'

export const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-on-neutral-soft',
  warn: 'bg-warn-soft text-on-warn-soft',
  ok: 'bg-ok-soft text-on-ok-soft',
  info: 'bg-info-soft text-on-info-soft',
  error: 'bg-error-soft text-on-error-soft',
}

/** A small status pill. `role="status"` so changes are announced. */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-medium tabular-nums ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}
