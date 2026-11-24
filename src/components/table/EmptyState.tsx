import { useStore } from '../../store'

const box = 'rounded border border-dashed p-6 text-sm'

/** What the table area says before there is a table: still loading, failed to load, running, or ready to run. */
export function EmptyState() {
  const status = useStore((s) => s.runnerStatus)
  const running = useStore((s) => s.running)
  const retryRuntime = useStore((s) => s.retryRuntime)

  if (status.state === 'failed') {
    return (
      <div role="alert" className={`${box} border-red-400 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100`}>
        <p className="font-semibold">Python couldn’t be loaded</p>
        <p className="mt-1">
          The Python runtime is downloaded from a CDN the first time, so this needs an internet connection (and a network that doesn’t
          block <span className="font-mono">cdn.jsdelivr.net</span>). Your code is safe.
        </p>
        <p className="mt-1 font-mono text-xs">{status.message}</p>
        <button
          type="button"
          onClick={() => void retryRuntime()}
          className="mt-3 rounded bg-red-700 px-3 py-1.5 font-medium text-white hover:bg-red-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-700"
        >
          Try again
        </button>
      </div>
    )
  }

  const muted = `${box} border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-300`
  if (status.state === 'uninitialised' || status.state === 'loading') {
    return (
      <div role="status" className={muted}>
        <p className="font-semibold">Getting Python ready…</p>
        <p className="mt-1">
          {status.state === 'loading' ? status.message : 'Starting'}. The first visit downloads about 10 MB; after that it comes from your
          browser’s cache. Your table will appear here automatically.
        </p>
      </div>
    )
  }
  return (
    <p className={muted}>
      {running ? 'Running…' : 'Press ▶ Run (or Ctrl/⌘ + Enter) to generate the trace table.'}
    </p>
  )
}
