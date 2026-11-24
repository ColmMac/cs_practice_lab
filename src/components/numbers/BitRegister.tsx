import type { Bits } from '../../core/numbers'
import type { View } from './useBitSandbox'

/** A register of toggle buttons with its weights row, MSB first, as on an exam paper. */
export function BitRegister({ bits, view, onToggle }: { bits: Bits; view: View; onToggle: (index: number) => void }) {
  const n = bits.length
  return (
    <div role="group" aria-label={`${n}-bit register`} className="overflow-x-auto pb-1">
      <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(2.5rem, 1fr))` }}>
        {bits.map((b, i) => {
          const weight = i === 0 && view === 'signed' ? -(2 ** (n - 1)) : 2 ** (n - 1 - i)
          return (
            <div key={i} className="flex flex-col items-stretch gap-1 text-center">
              <span className="text-xs text-slate-600 dark:text-slate-400">{n - 1 - i}</span>
              <button
                type="button"
                aria-pressed={b === 1}
                aria-label={`bit ${n - 1 - i}, weight ${weight}`}
                onClick={() => onToggle(i)}
                className={`rounded border px-2 py-2 font-mono text-base font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700 ${
                  b === 1
                    ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800'
                    : 'border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {b}
              </button>
              <span
                data-testid="bit-weight"
                className={`font-mono text-xs ${weight < 0 ? 'text-red-700 dark:text-red-300' : 'text-slate-600 dark:text-slate-400'}`}
              >
                {weight}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
