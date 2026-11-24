import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_TRACE_OPTIONS, type TraceOptions } from '../../src/core/types'
import { PythonTraceRunner } from '../../src/languages/python/PythonTraceRunner'
import type { FromWorker, ToWorker, WireResult } from '../../src/languages/python/protocol'
import { materialise } from '../../src/languages/python/materialise'
import { traces } from './fixtures'
import watchesLoop from '../fixtures/wire/watches-loop.json'

class FakeWorker {
  sent: ToWorker[] = []
  terminated = false
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage(m: ToWorker) {
    this.sent.push(m)
    if (m.type === 'init') queueMicrotask(() => this.say({ type: 'status', status: 'ready' }))
  }
  terminate() {
    this.terminated = true
  }
  say(m: FromWorker) {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>)
  }
}

const opts = (o: Partial<TraceOptions> = {}): TraceOptions => ({ ...DEFAULT_TRACE_OPTIONS, ...o })

describe('watch results in the materialised trace', () => {
  it('every step exposes every watch (carried forward) even though only changes are sent', () => {
    const steps = traces.watchesLoop.steps
    expect(steps.every((s) => 'cond' in s.watches)).toBe(true)
    const wire = (watchesLoop as unknown as { wire: WireResult }).wire
    expect(wire.steps.filter((s) => s.wt).length).toBeLessThan(steps.length) // the wire really is delta-encoded
  })

  it('carries real values: i < n is True while looping and False at the end', () => {
    const vals = traces.watchesLoop.steps.map((s) => {
      const w = s.watches.cond
      return w && w.ok ? (w.value as { v: boolean }).v : w?.reason
    })
    expect(vals).toEqual(['not-in-scope', true, true, true, true, true, true, false, false])
  })

  it('unchanged watch objects are shared between steps', () => {
    const [a, b] = [traces.watchesLoop.steps[2]!, traces.watchesLoop.steps[3]!]
    expect(a.watches).toBe(b.watches) // no change between them → same object, no copying
  })

  it('a rejected watch reports once with a message that explains why', () => {
    const bad = traces.watchesFn.steps[0]!.watches.bad
    expect(bad).toMatchObject({ ok: false, reason: 'rejected' })
    expect(bad && !bad.ok && bad.message).toMatch(/can't call \.pop\(\).*change your program's state/)
  })

  it('materialising chunked results keeps watches consistent across the chunk boundary', () => {
    const wire = (watchesLoop as unknown as { wire: WireResult }).wire
    const whole = materialise(wire, { runId: 'r', code: 'c', options: opts() })
    expect(whole.steps.map((s) => s.watches.cond)).toEqual(traces.watchesLoop.steps.map((s) => s.watches.cond))
  })
})

describe('PythonTraceRunner watch support', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const setup = () => {
    const workers: FakeWorker[] = []
    const runner = new PythonTraceRunner('https://example.test/', () => {
      const w = new FakeWorker()
      workers.push(w)
      return w as unknown as Worker
    })
    return { runner, workers }
  }

  it('advertises watch support', () => {
    expect(setup().runner.capabilities.watchExpressions).toBe(true)
  })

  it('sends only ENABLED watches (id, expr, scope) with the run', async () => {
    const { runner, workers } = setup()
    void runner.runTrace('x = 1', opts({
      watches: [
        { id: 'a', expr: 'x', scope: { kind: 'current' }, enabled: true },
        { id: 'b', expr: 'y', scope: { kind: 'module' }, enabled: false },
        { id: 'c', expr: 'x + 1', label: 'ignored', scope: { kind: 'function', name: 'f' }, enabled: true },
      ],
    }))
    await vi.advanceTimersByTimeAsync(0)
    const run = workers[0]!.sent.find((m) => m.type === 'run') as Extract<ToWorker, { type: 'run' }>
    expect(run.options.watches).toEqual([
      { id: 'a', expr: 'x', scope: { kind: 'current' } },
      { id: 'c', expr: 'x + 1', scope: { kind: 'function', name: 'f' } },
    ])
  })

  it('validateWatch round-trips through the worker', async () => {
    const { runner, workers } = setup()
    const p = runner.validateWatch('arr.pop()')
    await vi.advanceTimersByTimeAsync(0)
    const req = workers[0]!.sent.find((m) => m.type === 'validate-watch') as Extract<ToWorker, { type: 'validate-watch' }>
    expect(req.expr).toBe('arr.pop()')
    workers[0]!.say({ type: 'watch-validated', requestId: req.requestId, ok: false, message: 'nope' })
    expect(await p).toEqual({ ok: false, message: 'nope' })
  })

  it('answers concurrent validations to the right callers', async () => {
    const { runner, workers } = setup()
    const a = runner.validateWatch('a')
    const b = runner.validateWatch('b')
    await vi.advanceTimersByTimeAsync(0)
    const reqs = workers[0]!.sent.filter((m): m is Extract<ToWorker, { type: 'validate-watch' }> => m.type === 'validate-watch')
    workers[0]!.say({ type: 'watch-validated', requestId: reqs[1]!.requestId, ok: true })
    workers[0]!.say({ type: 'watch-validated', requestId: reqs[0]!.requestId, ok: false, message: 'bad a' })
    expect(await a).toEqual({ ok: false, message: 'bad a' })
    expect(await b).toEqual({ ok: true })
  })

  it('a validation waiting on a worker that gets killed resolves instead of hanging', async () => {
    const { runner, workers } = setup()
    const run = runner.runTrace('x = 1', opts({ timeoutMs: 100 }))
    await vi.advanceTimersByTimeAsync(0)
    const v = runner.validateWatch('x')
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(100 + 1500) // hard kill → respawn
    expect((await run).status).toBe('timeout')
    expect(await v).toEqual({ ok: true }) // unknown, not stuck: the next run reports a bad watch per step
    expect(workers).toHaveLength(2)
  })

  it('a worker error while validating is a rejected watch, not a dead runtime', async () => {
    const { runner, workers } = setup()
    const p = runner.validateWatch('x')
    await vi.advanceTimersByTimeAsync(0)
    const req = workers[0]!.sent.find((m) => m.type === 'validate-watch') as Extract<ToWorker, { type: 'validate-watch' }>
    workers[0]!.say({ type: 'watch-validated', requestId: req.requestId, ok: false })
    expect(await p).toEqual({ ok: false, message: 'Not allowed in a watch expression.' })
    expect(runner.getStatus().state).toBe('ready')
  })
})
