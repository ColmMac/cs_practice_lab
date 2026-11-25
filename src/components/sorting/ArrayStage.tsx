import type { Frame, Mark } from '../../core/algorithms'

/** Colour AND a word AND a symbol for every state, so no meaning rests on colour alone. */
export const MARK_STYLE: Record<Mark, { label: string; icon: string; cls: string }> = {
  none: { label: '', icon: '', cls: 'border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900' },
  compare: { label: 'Comparing', icon: '?', cls: 'border-state-compare bg-state-compare-soft' },
  swap: { label: 'Swapped', icon: '⇄', cls: 'border-state-swap bg-state-swap-soft' },
  shift: { label: 'Shifted', icon: '→', cls: 'border-state-swap bg-state-swap-soft' },
  placed: { label: 'Placed', icon: '↓', cls: 'border-state-swap bg-state-swap-soft' },
  held: { label: 'Key', icon: '↑', cls: 'border-state-held bg-state-held-soft' },
  active: { label: 'In play', icon: '◇', cls: 'border-state-active bg-state-active-soft' },
  merged: { label: 'Merged', icon: '+', cls: 'border-state-sorted bg-state-sorted-soft' },
  sorted: { label: 'Sorted', icon: '✓', cls: 'border-state-sorted bg-state-sorted-soft' },
  mid: { label: 'Middle', icon: '◆', cls: 'border-state-active bg-state-active-soft' },
  found: { label: 'Found', icon: '★', cls: 'border-state-found-edge bg-state-found text-white' },
  discarded: {
    label: 'Ruled out',
    icon: '×',
    cls: 'border-dashed border-slate-400 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
}

const SLOT = 4.5 // rem: card width plus gap

/**
 * The cards, absolutely placed by slot so a move is a CSS transform (and `motion-reduce` turns the slide off).
 * The DOM order is the id order and never changes, which is what lets a card slide instead of re-mount.
 */
export function ArrayStage({ frame, count }: { frame: Frame; count: number }) {
  return (
    <div className="overflow-x-auto pb-1">
      <div className="relative pt-6" style={{ width: `${count * SLOT}rem`, height: '9.5rem' }}>
        <ul aria-label="Array cards" className="contents">
          {frame.cards.map((c) => {
            const m = MARK_STYLE[frame.marks[c.id] ?? 'none']
            return (
              <li
                key={c.id}
                data-testid="card"
                data-value={c.value}
                data-pos={c.pos}
                data-mark={frame.marks[c.id] ?? 'none'}
                aria-label={`index ${c.pos}, value ${c.value}${m.label ? `, ${m.label}` : ''}`}
                className={`absolute top-6 left-0 flex h-20 w-16 list-none flex-col items-center justify-center rounded border-2 text-slate-900 transition-transform duration-300 ease-out motion-reduce:transition-none dark:text-slate-100 ${m.cls} ${
                  frame.marks[c.id] === 'found' ? 'text-white dark:text-white' : ''
                }`}
                style={{ transform: `translate(${c.pos * SLOT}rem, ${c.lifted ? '-1.25rem' : '0'})` }}
              >
                <span className="font-mono text-xl font-semibold tabular-nums">{c.value}</span>
                <span aria-hidden="true" className="h-4 text-xs">
                  {m.label && (
                    <>
                      <span className="mr-0.5">{m.icon}</span>
                      {m.label}
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
        <div aria-hidden="true" className="absolute top-[7.25rem] left-0 flex">
          {Array.from({ length: count }, (_, i) => (
            <span
              key={i}
              className="w-16 text-center font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400"
              style={{ marginRight: `${SLOT - 4}rem` }}
            >
              {i}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
