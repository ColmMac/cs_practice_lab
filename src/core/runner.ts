import type { LanguageId, TraceOptions, TraceResult } from './types'

export type RunnerStatus =
  | { state: 'uninitialised' }
  | { state: 'loading'; message: string; progress?: number }
  | { state: 'ready' }
  | { state: 'running'; stepsExecuted: number }
  | { state: 'failed'; message: string }

export interface RunnerCapabilities {
  watchExpressions: boolean
  stdin: boolean
  inputMode: 'rerun' | 'blocking' | 'none'
  hardInterrupt: boolean
  branchInfo: boolean
  returnValues: boolean
}

/**
 * Adapter contract every language implements. The UI, derive layer, study mode and exporters
 * depend only on this interface and the types in ./types.
 */
export interface TraceRunner {
  readonly language: LanguageId
  readonly capabilities: RunnerCapabilities
  getStatus(): RunnerStatus
  onStatus(listener: (s: RunnerStatus) => void): () => void
  /** Idempotent. */
  init(): Promise<void>
  /** Resolves with a TraceResult for ALL user-code outcomes; rejects only if the runtime itself is broken. */
  runTrace(code: string, options: TraceOptions): Promise<TraceResult>
  validateWatch?(expr: string): Promise<{ ok: true } | { ok: false; message: string }>
  cancel(): void
  dispose(): void
}
