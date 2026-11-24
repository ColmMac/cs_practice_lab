import type { TraceResult } from '../../core/types'

const TITLES: Record<string, string> = {
  'syntax-error': 'Syntax error',
  'runtime-error': 'Your program crashed',
  'step-limit': 'Stopped: too many steps',
  timeout: 'Stopped: took too long',
  'awaiting-input': 'Your program needs more input',
  cancelled: 'Run cancelled',
  'internal-error': 'Something went wrong in the tracer',
}

export function ErrorBanner({ result }: { result: TraceResult }) {
  if (result.status === 'ok') return null
  const err = result.error
  const hasRows = result.steps.length > 0
  const hint =
    result.status === 'awaiting-input'
      ? 'Type an answer below; the program runs again from the start with it added to Program inputs.'
      : hasRows && result.status !== 'cancelled'
        ? 'The table below shows the steps recorded before it stopped.'
        : ''
  return (
    <div
      role="alert"
      className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100"
    >
      <p className="font-semibold">
        {TITLES[result.status] ?? 'Problem'}
        {err?.line ? <span className="font-normal"> — line {err.line}</span> : null}
      </p>
      {err?.message ? <p className="mt-1 font-mono text-xs whitespace-pre-wrap">{err.message}</p> : null}
      {hint ? <p className="mt-1">{hint}</p> : null}
    </div>
  )
}
