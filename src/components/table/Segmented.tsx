interface Props<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
}

/** Accessible two-or-more way toggle (a radio group rendered as buttons). */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-2 text-xs">
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-700">
        {options.map((o) => {
          const on = o.value === value
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={`px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 ${
                on
                  ? 'bg-emerald-700 text-white'
                  : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </span>
    </div>
  )
}
