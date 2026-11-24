import { executionKey } from '../../core/executionKey'
import type { RunnerCapabilities, RunnerStatus, TraceRunner } from '../../core/runner'
import type { TraceOptions, TraceResult, TraceStatus } from '../../core/types'
import { materialise } from './materialise'
import {
  PYODIDE_INDEX_URL,
  type FromWorker,
  type ToWorker,
  type WireOptions,
  type WireResult,
} from './protocol'

/** Extra time past the tracer's own soft deadline before the worker is killed outright. */
export const HARD_KILL_GRACE_MS = 1500

const defaultWorker = () => new Worker(new URL('./python.worker.ts', import.meta.url), { type: 'module' })

interface ActiveRun {
  runId: string
  code: string
  options: TraceOptions
  resolve: (r: TraceResult) => void
  reject: (e: Error) => void
  timer: ReturnType<typeof setTimeout>
  detachAbort?: () => void
}

let runCounter = 0

/** TraceRunner for Python: Pyodide + tracer.py inside a dedicated Web Worker. */
export class PythonTraceRunner implements TraceRunner {
  readonly language = 'python' as const
  readonly capabilities: RunnerCapabilities = {
    watchExpressions: false,
    stdin: true,
    inputMode: 'rerun',
    hardInterrupt: false,
    branchInfo: false,
    returnValues: true,
  }

  private status: RunnerStatus = { state: 'uninitialised' }
  private listeners = new Set<(s: RunnerStatus) => void>()
  private worker: Worker | null = null
  private ready: Promise<void> | null = null
  private current: ActiveRun | null = null

  constructor(
    private readonly indexURL: string = PYODIDE_INDEX_URL,
    private readonly createWorker: () => Worker = defaultWorker,
  ) {}

  getStatus(): RunnerStatus {
    return this.status
  }

  onStatus(listener: (s: RunnerStatus) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  init(): Promise<void> {
    return this.ready ?? this.spawn()
  }

  async runTrace(code: string, options: TraceOptions): Promise<TraceResult> {
    if (this.current) this.stop('cancelled', 'Run replaced by a newer run.')
    await this.init()
    const worker = this.worker
    if (!worker) throw new Error('Python runtime is not available')

    const runId = `py-${++runCounter}`
    if (options.signal?.aborted) return this.emptyResult('cancelled', 'Run cancelled.', runId, code, options)

    return new Promise<TraceResult>((resolve, reject) => {
      const run: ActiveRun = {
        runId,
        code,
        options,
        resolve,
        reject,
        // Hard backstop: the tracer enforces limits itself, but code blocked inside C (or a loop that
        // somehow evaded the tracer) can only be stopped by killing the worker.
        timer: setTimeout(() => {
          const secs = (options.timeoutMs + HARD_KILL_GRACE_MS) / 1000
          this.stop(
            'timeout',
            `Stopped: your program did not finish within ${secs.toFixed(1)} s. It may be stuck in an infinite loop or a very long operation.`,
          )
        }, options.timeoutMs + HARD_KILL_GRACE_MS),
      }
      if (options.signal) {
        const onAbort = () => this.stop('cancelled', 'Run cancelled.')
        options.signal.addEventListener('abort', onAbort, { once: true })
        run.detachAbort = () => options.signal?.removeEventListener('abort', onAbort)
      }
      this.current = run
      this.setStatus({ state: 'running', stepsExecuted: 0 })
      const msg: ToWorker = { type: 'run', runId, code, options: toWireOptions(options) }
      worker.postMessage(msg)
    })
  }

  cancel(): void {
    if (this.current) this.stop('cancelled', 'Run cancelled.')
  }

  dispose(): void {
    if (this.current) this.stop('cancelled', 'Runner disposed.', false)
    this.worker?.terminate()
    this.worker = null
    this.ready = null
    this.listeners.clear()
    this.status = { state: 'uninitialised' }
  }

  // ───────────── internals ─────────────

  private spawn(): Promise<void> {
    this.worker?.terminate()
    const worker = this.createWorker()
    this.worker = worker
    this.setStatus({ state: 'loading', message: 'Starting Python runtime…' })

    const ready = new Promise<void>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<FromWorker>) => {
        if (worker !== this.worker) return // message from a worker we already killed
        this.onMessage(e.data, resolve, reject)
      }
      worker.onerror = (e) => {
        if (worker !== this.worker) return
        const message = e.message || 'The Python worker crashed.'
        this.fail(message)
        reject(new Error(message))
      }
    })
    ready.catch(() => {}) // callers handle it via init(); avoid unhandled-rejection noise otherwise
    this.ready = ready
    const init: ToWorker = { type: 'init', indexURL: this.indexURL }
    worker.postMessage(init)
    return ready
  }

  private onMessage(msg: FromWorker, resolveReady: () => void, rejectReady: (e: Error) => void) {
    switch (msg.type) {
      case 'status':
        if (msg.status === 'ready') {
          this.setStatus({ state: 'ready' })
          resolveReady()
        } else {
          this.setStatus({ state: 'loading', message: msg.message ?? 'Loading…' })
        }
        break
      case 'fatal':
        this.fail(msg.message)
        rejectReady(new Error(msg.message))
        break
      case 'done':
        this.finish(msg.runId, (run) => this.toResult(msg.result, run))
        break
      case 'run-failed':
        this.finish(msg.runId, (run) =>
          this.emptyResult('internal-error', `Internal error: ${msg.message}`, run.runId, run.code, run.options),
        )
        break
    }
  }

  private finish(runId: string, build: (run: ActiveRun) => TraceResult) {
    const run = this.current
    if (!run || run.runId !== runId) return // stale: that run was already cancelled / timed out
    this.clear(run)
    this.setStatus({ state: 'ready' })
    run.resolve(build(run))
  }

  /** Kill the worker, resolve the in-flight run with `status`, and start a fresh runtime. */
  private stop(status: TraceStatus, message: string, respawn = true) {
    const run = this.current
    if (!run) return
    this.clear(run)
    run.resolve(this.emptyResult(status, message, run.runId, run.code, run.options))
    if (respawn) this.spawn()
  }

  private clear(run: ActiveRun) {
    clearTimeout(run.timer)
    run.detachAbort?.()
    this.current = null
  }

  private fail(message: string) {
    this.setStatus({ state: 'failed', message })
    this.ready = null // next init() retries with a fresh worker
    const run = this.current
    if (run) {
      this.clear(run)
      run.reject(new Error(message))
    }
  }

  private toResult(wire: WireResult, run: ActiveRun): TraceResult {
    return materialise(wire, { runId: run.runId, code: run.code, options: run.options })
  }

  private emptyResult(
    status: TraceStatus,
    message: string,
    runId: string,
    code: string,
    options: TraceOptions,
  ): TraceResult {
    return {
      runId,
      language: 'python',
      status,
      steps: [],
      variables: [],
      functions: [],
      stdout: '',
      error: { kind: status, message },
      stats: { stepsExecuted: 0, durationMs: 0, truncated: false },
      executionKey: executionKey('python', code, options),
    }
  }

  private setStatus(s: RunnerStatus) {
    this.status = s
    this.listeners.forEach((l) => l(s))
  }
}

function toWireOptions(o: TraceOptions): WireOptions {
  return {
    maxSteps: o.maxSteps,
    timeoutMs: o.timeoutMs,
    maxCallDepth: o.maxCallDepth,
    stdin: o.stdin,
    randomSeed: o.randomSeed,
    valueLimits: o.valueLimits,
    showCallables: o.showCallables,
  }
}
