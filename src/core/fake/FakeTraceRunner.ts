import type { RunnerCapabilities, RunnerStatus, TraceRunner } from '../runner'
import type { LanguageId, TraceOptions, TraceResult } from '../types'

/**
 * Replays a canned TraceResult. Lets UI/derive/study/export be built and tested with no Pyodide,
 * and proves the UI depends only on the TraceRunner contract.
 */
export class FakeTraceRunner implements TraceRunner {
  readonly language: LanguageId
  readonly capabilities: RunnerCapabilities = {
    watchExpressions: false,
    stdin: true,
    inputMode: 'rerun',
    hardInterrupt: false,
    branchInfo: true,
    returnValues: true,
  }
  private status: RunnerStatus = { state: 'uninitialised' }
  private listeners = new Set<(s: RunnerStatus) => void>()

  /** Present only when a validator was supplied, like a runner that supports watch expressions. */
  validateWatch?: (expr: string) => Promise<{ ok: true } | { ok: false; message: string }>

  constructor(
    private readonly result: TraceResult | ((code: string, options: TraceOptions) => TraceResult),
    language: LanguageId = 'python',
    validate?: (expr: string) => { ok: true } | { ok: false; message: string },
  ) {
    this.language = language
    if (validate) this.validateWatch = async (expr) => validate(expr)
  }

  getStatus(): RunnerStatus {
    return this.status
  }

  onStatus(listener: (s: RunnerStatus) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async init(): Promise<void> {
    if (this.status.state !== 'uninitialised') return
    this.setStatus({ state: 'loading', message: 'Loading fake runtime…' })
    this.setStatus({ state: 'ready' })
  }

  async runTrace(code: string, options: TraceOptions): Promise<TraceResult> {
    await this.init()
    this.setStatus({ state: 'running', stepsExecuted: 0 })
    const result = typeof this.result === 'function' ? this.result(code, options) : this.result
    this.setStatus({ state: 'ready' })
    return result
  }

  cancel(): void {}

  dispose(): void {
    this.listeners.clear()
    this.status = { state: 'uninitialised' }
  }

  private setStatus(s: RunnerStatus) {
    this.status = s
    this.listeners.forEach((l) => l(s))
  }
}
