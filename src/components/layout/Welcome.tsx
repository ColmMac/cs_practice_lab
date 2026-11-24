import { useStore } from '../../store'

/** A one-time hint for first-time visitors, shown above the first table. Dismissal is remembered. */
export function Welcome() {
  const welcomed = useStore((s) => s.welcomed)
  const dismissWelcome = useStore((s) => s.dismissWelcome)
  if (welcomed) return null
  return (
    <section
      aria-label="Welcome"
      className="mb-3 flex flex-wrap items-start gap-3 rounded border border-emerald-700/40 bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
    >
      <p className="min-w-0 flex-1">
        <strong>Welcome.</strong> This is a ready-made example. Change the code and press <strong>Run</strong>, pick another example from the
        list, or switch on <strong>📝 Study mode</strong> to hide the answers and fill the table in yourself. Everything runs in your browser;
        nothing is uploaded.
      </p>
      <button
        type="button"
        onClick={dismissWelcome}
        className="rounded border border-emerald-700 px-2.5 py-1 text-xs font-medium hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:hover:bg-emerald-900"
      >
        Got it
      </button>
    </section>
  )
}
