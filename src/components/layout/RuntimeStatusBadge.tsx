import type { RunnerStatus } from '../../core/runner'
import { useStore } from '../../store'
import { Badge, type BadgeTone } from '../ui/Badge'

function describe(s: RunnerStatus): { text: string; tone: BadgeTone } {
  switch (s.state) {
    case 'uninitialised':
      return { text: 'Idle', tone: 'neutral' }
    case 'loading':
      // no wider than "Python ready" (see below). EmptyState says what is downloading.
      return { text: 'Loading…', tone: 'warn' }
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
      {status.state === 'failed' ? (
        text
      ) : (
        // As wide as "Python ready" in every state: a width that changes can rewrap the toolbar and move the page.
        // The invisible copy is CSS content, so it is not part of the badge's text.
        <span className="inline-grid justify-items-center before:invisible before:col-start-1 before:row-start-1 before:content-['Python_ready']">
          <span className="col-start-1 row-start-1">{text}</span>
        </span>
      )}
      {status.state === 'failed' && (
        <button type="button" onClick={() => void retryRuntime()} className="rounded border border-current px-1.5 py-0.5">
          Retry
        </button>
      )}
    </Badge>
  )
}
