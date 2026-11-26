import type { ReactNode } from 'react'

export type BadgeTone = 'neutral' | 'warn' | 'ok' | 'info' | 'error'

export const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-neutral-soft text-on-neutral-soft',
  warn: 'bg-warn-soft text-on-warn-soft',
  ok: 'bg-ok-soft text-on-ok-soft',
  info: 'bg-info-soft text-on-info-soft',
  error: 'bg-error-soft text-on-error-soft',
}

/**
 * A small status pill. `role="status"` so changes are announced; `quiet` keeps the role but says nothing, for a
 * pill whose words the page already announces.
 */
export function Badge({ tone = 'neutral', quiet = false, children }: { tone?: BadgeTone; quiet?: boolean; children: ReactNode }) {
  return (
    <span role="status" aria-live={quiet ? 'off' : undefined} className={`inline-flex items-center gap-2 rounded px-2 py-1 text-xs font-medium tabular-nums ${BADGE_TONES[tone]}`}>
      {children}
    </span>
  )
}
