interface Props<T extends string> {
  label: string
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (v: T) => void
}

/** Accessible two-or-more way toggle (a radio group rendered as buttons). */
export function SegmentedToggle<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-2 text-xs">
      <span className="text-text-muted">{label}</span>
      <span className="inline-flex overflow-hidden rounded border border-border">
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
              className={`px-2.5 py-1 font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${
                on
                  ? 'bg-accent-fill text-on-accent'
                  : 'bg-surface-elevated text-text-muted hover:bg-surface-strong hover:text-text'
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
