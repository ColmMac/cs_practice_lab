import type { RunnerStatus } from '../../core/runner'
import { useStore } from '../../store'
import { Badge, type BadgeTone } from '../ui/Badge'

function describe(s: RunnerStatus): { text: string; tone: BadgeTone } {
  switch (s.state) {
    case 'uninitialised':
      return { text: 'Python not started', tone: 'neutral' }
    case 'loading':
      // short on purpose: a long line rewraps the toolbar and moves the page. EmptyState says what is downloading.
      return { text: 'Loading Python…', tone: 'warn' }
    case 'ready':
      return { text: 'Python ready', tone: 'ok' }
    case 'running':
      return { text: 'Running…', tone: 'info' }
    case 'failed':
      return { text: `Python failed to load: ${s.message}`, tone: 'error' }
  }
}

export function RuntimeStatusBadge() {
  const status = useStore((s) => s.runnerStatus)
  const retryRuntime = useStore((s) => s.retryRuntime)
  const { text, tone } = describe(status)
  return (
    <Badge tone={tone}>
      {text}
      {status.state === 'failed' && (
        <button type="button" onClick={() => void retryRuntime()} className="rounded border border-current px-1.5 py-0.5">
          Retry
        </button>
      )}
    </Badge>
  )
}
