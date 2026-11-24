import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TRACE_OPTIONS, type TraceOptions } from '../../src/core/types'
import { HARD_KILL_GRACE_MS, PythonTraceRunner } from '../../src/languages/python/PythonTraceRunner'
import type { FromWorker, ToWorker } from '../../src/languages/python/protocol'
import digitSum from '../fixtures/wire/digit-sum.json'

/** Stand-in for the Web Worker: records what the runner sends, lets the test play the worker's side. */
class FakeWorker {
  sent: ToWorker[] = []
  terminated = false
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  autoReady = true

  postMessage(m: ToWorker) {
    this.sent.push(m)
    if (m.type === 'init' && this.autoReady) queueMicrotask(() => this.say({ type: 'status', status: 'ready' }))
  }
  terminate() {
    this.terminated = true
  }
  say(m: FromWorker) {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>)
  }
  lastRun() {
    return this.sent.filter((m): m is Extract<ToWorker, { type: 'run' }> => m.type === 'run').at(-1)!
  }
}

const opts = (o: Partial<TraceOptions> = {}): TraceOptions => ({ ...DEFAULT_TRACE_OPTIONS, ...o })

function setup() {
  const workers: FakeWorker[] = []
  const runner = new PythonTraceRunner('https://example.test/pyodide/', () => {
    const w = new FakeWorker()
    workers.push(w)
    return w as unknown as Worker
  })
  return { runner, workers }
}

describe('PythonTraceRunner', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('init loads the worker, reports status, and is idempotent', async () => {
    const { runner, workers } = setup()
    const states: string[] = []
    runner.onStatus((s) => states.push(s.state))
    await Promise.all([runner.init(), runner.init()])
    expect(workers).toHaveLength(1)
    expect(workers[0]!.sent[0]).toEqual({ type: 'init', indexURL: 'https://example.test/pyodide/' })
    expect(states).toEqual(['loading', 'ready'])
  })

  it('runs a trace: sends wire options, resolves with a materialised TraceResult', async () => {
    const { runner, workers } = setup()
    const p = runner.runTrace(digitSum.code, opts({ stdin: ['a'] }))
    await vi.advanceTimersByTimeAsync(0)
    const w = workers[0]!
    const run = w.lastRun()
    expect(run.options).toMatchObject({ maxSteps: 1000, stdin: ['a'], timeoutMs: 3000 })
    expect(run.options).not.toHaveProperty('signal')
    expect(runner.getStatus().state).toBe('running')

    w.say({ type: 'done', runId: run.runId, result: digitSum.wire as never })
    const result = await p
    expect(result.status).toBe('ok')
    expect(result.steps).toHaveLength(20)
    expect(runner.getStatus().state).toBe('ready')
  })

  it('hard-kills a worker that never answers, resolves "timeout", and respawns', async () => {
    const { runner, workers } = setup()
    const p = runner.runTrace('while True: pass', opts({ timeoutMs: 1000 }))
    await vi.advanceTimersByTimeAsync(1000 + HARD_KILL_GRACE_MS)
    const result = await p
    expect(result.status).toBe('timeout')
    expect(result.error?.message).toMatch(/did not finish/)
    expect(workers[0]!.terminated).toBe(true)
    expect(workers).toHaveLength(2) // fresh runtime started
    await vi.advanceTimersByTimeAsync(0)
    expect(runner.getStatus().state).toBe('ready')
  })

  it('does not kill a run that finishes before the deadline', async () => {
    const { runner, workers } = setup()
    const p = runner.runTrace('x = 1', opts({ timeoutMs: 1000 }))
    await vi.advanceTimersByTimeAsync(10)
    const w = workers[0]!
    w.say({ type: 'done', runId: w.lastRun().runId, result: digitSum.wire as never })
    await p
    await vi.advanceTimersByTimeAsync(10_000)
    expect(w.terminated).toBe(false)
    expect(workers).toHaveLength(1)
  })

  it('cancel() resolves the in-flight run as "cancelled" and ignores the dead worker’s late answer', async () => {
    const { runner, workers } = setup()
    const p = runner.runTrace('x = 1', opts())
    await vi.advanceTimersByTimeAsync(0)
    const old = workers[0]!
    const runId = old.lastRun().runId
    runner.cancel()
    expect((await p).status).toBe('cancelled')
    expect(old.terminated).toBe(true)
    old.say({ type: 'done', runId, result: digitSum.wire as never }) // late message from killed worker
    expect(workers).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(0)
    expect(runner.getStatus().state).toBe('ready')
  })

  it('an AbortSignal cancels the run', async () => {
    const { runner } = setup()
    const ac = new AbortController()
    const p = runner.runTrace('x = 1', opts({ signal: ac.signal }))
    await vi.advanceTimersByTimeAsync(0)
    ac.abort()
    expect((await p).status).toBe('cancelled')
  })

  it('a new run replaces an in-flight one', async () => {
    const { runner, workers } = setup()
    const first = runner.runTrace('a', opts())
    await vi.advanceTimersByTimeAsync(0)
    const second = runner.runTrace('b', opts())
    expect((await first).status).toBe('cancelled')
    await vi.advanceTimersByTimeAsync(0)
    const w = workers.at(-1)!
    w.say({ type: 'done', runId: w.lastRun().runId, result: digitSum.wire as never })
    expect((await second).status).toBe('ok')
  })

  it('harness failures resolve as internal-error (never reject)', async () => {
    const { runner, workers } = setup()
    const p = runner.runTrace('x = 1', opts())
    await vi.advanceTimersByTimeAsync(0)
    const w = workers[0]!
    w.say({ type: 'run-failed', runId: w.lastRun().runId, message: 'boom' })
    const r = await p
    expect(r.status).toBe('internal-error')
    expect(r.error?.message).toMatch(/boom/)
  })

  it('rejects init and reports "failed" when Pyodide cannot load, then retries on the next init', async () => {
    const { runner, workers } = setup()
    const first = new FakeWorker()
    first.autoReady = false
    // swap the factory result for the first worker only
    const r2 = new PythonTraceRunner('x', (() => {
      const w = workers.length === 0 ? first : new FakeWorker()
      workers.push(w)
      return w as unknown as Worker
    }) as () => Worker)
    const init = r2.init()
    first.say({ type: 'fatal', message: 'offline' })
    await expect(init).rejects.toThrow('offline')
    expect(r2.getStatus()).toEqual({ state: 'failed', message: 'offline' })
    await r2.init() // retry spawns a new worker that does become ready
    expect(r2.getStatus().state).toBe('ready')
    void runner
  })
})
