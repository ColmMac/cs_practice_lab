import { useStore } from '../../store'

/** A one-time hint for first-time visitors, shown above the first table. Dismissal is remembered. */
export function Welcome() {
  const welcomed = useStore((s) => s.welcomed)
  const dismissWelcome = useStore((s) => s.dismissWelcome)
  if (welcomed) return null
  return (
    <section
      aria-label="Welcome"
      className="mb-3 flex flex-wrap items-start gap-3 rounded border border-accent/40 bg-accent-soft p-3 text-sm text-on-accent-soft projector:hidden"
    >
      <p className="min-w-0 flex-1">
        <strong>Welcome.</strong> Change the code and press <strong>Run</strong>, or switch on <strong>Study mode</strong> to fill the table in
        yourself; everything runs in your browser and nothing is uploaded.
      </p>
      <button
        type="button"
        onClick={dismissWelcome}
        className="rounded border border-accent px-2.5 py-1 text-xs font-medium hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
      >
        Got it
      </button>
    </section>
  )
}
