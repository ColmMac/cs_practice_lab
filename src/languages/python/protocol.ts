// Private wire format between python.worker.ts, tracer.py and PythonTraceRunner. See PLAN.md §3.
import type { TraceError, TraceStatus, Value, VariableMeta, WatchExpression, WatchResult } from '../../core/types'

/** Pyodide version served from the CDN. Must equal the `pyodide` npm package version (unit-tested). */
export const PYODIDE_VERSION = '314.0.8'
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

export interface WireOptions {
  maxSteps: number
  timeoutMs: number
  maxCallDepth: number
  stdin: string[]
  randomSeed: number
  valueLimits: { maxItems: number; maxDepth: number; maxStringLength: number }
  showCallables: boolean
  watches: { id: string; expr: string; scope: WatchExpression['scope'] }[] // enabled watches only
}

export interface WireFrame {
  id: number
  name: string
  depth: number
  callLine?: number
  argsLabel?: string
}

/** Compact step: values are DELTAS (only names whose value changed). The adapter rebuilds full scopes. */
export interface WireStep {
  i: number
  k: 'c' | 'l' | 'r' | 'x' // call / line / explicit return / uncaught exception
  ln: number
  f: number // active frame id
  stk: number[] // live user frame ids, outermost → innermost
  w?: [number, string, Value][] // [frameId, name, new value]
  d?: [number, string][] // [frameId, name] deleted
  o?: string
  r?: Value
  x?: { t: string; m: string; c: boolean }
  b?: boolean
  wt?: Record<string, WatchResult>
}

/** Incremental batch streamed while the program runs (only items not sent before). */
export interface WireChunk {
  steps: WireStep[]
  frames: WireFrame[]
  variables: VariableMeta[]
  rawSteps: number // line events executed so far (progress)
  line: number // line executing right now: where a blocked / killed run is stuck
}

/**
 * Final message. When chunks were streamed, `steps`/`frames`/`variables` hold only the TAIL not yet
 * streamed; the adapter concatenates chunks + tail.
 */
export interface WireResult {
  status: TraceStatus
  error?: TraceError | null
  inputRequest?: { prompt: string; consumedCount: number } | null
  steps: WireStep[]
  frames: WireFrame[]
  variables: VariableMeta[]
  functions: string[]
  stdout: string
  stats: { rawSteps: number; truncated: boolean; durationMs: number }
}

// Main → Worker
export type ToWorker =
  | { type: 'init'; indexURL: string }
  | { type: 'run'; runId: string; code: string; options: WireOptions }
  | { type: 'validate-watch'; requestId: string; expr: string }

// Worker → Main
export type FromWorker =
  | { type: 'status'; status: 'loading' | 'ready'; message?: string }
  | { type: 'chunk'; runId: string; chunk: WireChunk }
  | { type: 'done'; runId: string; result: WireResult }
  | { type: 'watch-validated'; requestId: string; ok: boolean; message?: string }
  | { type: 'run-failed'; runId: string; message: string } // harness bug, not user-code failure
  | { type: 'fatal'; message: string } // Pyodide failed to load
