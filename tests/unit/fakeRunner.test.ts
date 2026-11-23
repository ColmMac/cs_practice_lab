import { describe, expect, it } from 'vitest'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { tinyTrace } from '../../src/core/fake/fixtures'
import type { RunnerStatus, TraceRunner } from '../../src/core/runner'
import { DEFAULT_TRACE_OPTIONS } from '../../src/core/types'

describe('FakeTraceRunner (TraceRunner contract)', () => {
  it('walks uninitialised → loading → ready → running → ready and resolves with the result', async () => {
    const runner: TraceRunner = new FakeTraceRunner(tinyTrace)
    const states: RunnerStatus['state'][] = []
    runner.onStatus((s) => states.push(s.state))

    expect(runner.getStatus().state).toBe('uninitialised')
    const result = await runner.runTrace('n = 12', DEFAULT_TRACE_OPTIONS)

    expect(result).toBe(tinyTrace)
    expect(states).toEqual(['loading', 'ready', 'running', 'ready'])
  })

  it('init is idempotent', async () => {
    const runner = new FakeTraceRunner(tinyTrace)
    const states: string[] = []
    runner.onStatus((s) => states.push(s.state))
    await runner.init()
    await runner.init()
    expect(states).toEqual(['loading', 'ready'])
  })

  it('unsubscribe stops notifications', async () => {
    const runner = new FakeTraceRunner(tinyTrace)
    const seen: string[] = []
    const off = runner.onStatus((s) => seen.push(s.state))
    off()
    await runner.init()
    expect(seen).toEqual([])
  })
})
