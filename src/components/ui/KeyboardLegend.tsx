import type { ReactNode } from 'react'

interface Props {
  /** The Tab rule, listed after "previous" (the trace table's wide grid). */
  tab?: ReactNode
  /** Shown in place of the Alt+R entry while revealing is locked. */
  revealLocked?: string
  /** This tool's extra keys and answer tips. It follows "reveal", so it starts with its own separator. */
  children?: ReactNode
}

/** The keyboard contract of a grid of answer boxes (`answerGridKeyDown`), written under its buttons. */
export function KeyboardLegend({ tab, revealLocked, children }: Props) {
  return (
    <p className="text-[11px] text-slate-600 dark:text-slate-400">
      <kbd>Enter</kbd> / <kbd>↓</kbd> next · <kbd>Shift+Enter</kbd> / <kbd>↑</kbd> previous
      {tab && <> · {tab}</>} · <kbd>Alt+H</kbd> hint ·{' '}
      {revealLocked ?? (
        <>
          <kbd>Alt+R</kbd> reveal
        </>
      )}
      {children}
    </p>
  )
}
