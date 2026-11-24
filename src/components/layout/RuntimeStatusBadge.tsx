import type { RunnerStatus } from '../../core/runner'
import { useStore } from '../../store'

function describe(s: RunnerStatus): { text: string; tone: string } {
  switch (s.state) {
    case 'uninitialised':
      return { text: 'Python not started', tone: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200' }
    case 'loading':
      return {
        text: `${s.message} (first visit downloads ~10 MB)`,
        tone: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
      }
    case 'ready':
      return { text: 'Python ready', tone: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200' }
    case 'running':
      return { text: 'Running…', tone: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200' }
    case 'failed':
      return {
        text: `Python failed to load: ${s.message}`,
        tone: 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200',
      }
  }
}

export function RuntimeStatusBadge() {
  const status = useStore((s) => s.runnerStatus)
  const { text, tone } = describe(status)
  return (
    <span role="status" className={`rounded px-2 py-1 text-xs font-medium ${tone}`}>
      {text}
    </span>
  )
}
