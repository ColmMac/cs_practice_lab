import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pressRun, resetRunPress, RUN_COOLDOWN_MS, RUN_LIT_MS, useRunLit } from '../../src/components/layout/runPress'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import type { TraceResult } from '../../src/core/types'
import { defaultWorkspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

/** A runner that hands back a new result object each time, like the real one. */
function mount(make: () => TraceResult = () => ({ ...traces.digitSum })) {
  const runner = new FakeTraceRunner(make)
  const spy = vi.spyOn(runner, 'runTrace')
  setRunnerOverride(runner)
  useStore.setState({ ...defaultWorkspace('x = 1\n'), result: null, ranSig: null, running: false, challenge: null })
  return spy
}

const lit = () => useRunLit.getState().lit

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
  resetRunPress()
})
afterEach(() => {
  vi.useRealTimers()
  setRunnerOverride(null)
})

/** Starts a press and lets the fake runner's timers finish it. */
async function press() {
  const done = pressRun()
  await vi.advanceTimersByTimeAsync(50)
  await done
}

describe('pressing Run', () => {
  it('lights the button briefly once the table is filled', async () => {
    mount()
    await press()
    expect(lit()).toBe(true)
    await vi.advanceTimersByTimeAsync(RUN_LIT_MS)
    expect(lit()).toBe(false)
  })

  it('ignores another press during the cooldown, then allows one', async () => {
    const spy = mount()
    await press()
    await press()
    expect(spy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(RUN_COOLDOWN_MS)
    await press()
    expect(spy).toHaveBeenCalledTimes(2)
    expect(lit()).toBe(true)
  })

  it('does not light for a run the user did not ask for', async () => {
    mount()
    const done = useStore.getState().run()
    await vi.advanceTimersByTimeAsync(50)
    await done
    expect(useStore.getState().result).not.toBeNull()
    expect(lit()).toBe(false)
  })

  it('does not light when the run fails', async () => {
    mount(() => ({ ...traces.digitSum, status: 'runtime-error' }))
    await press()
    expect(lit()).toBe(false)
  })

  it('does not light when the table is empty', async () => {
    mount(() => ({ ...traces.digitSum, steps: [] }))
    await press()
    expect(lit()).toBe(false)
  })

  it('does not light when the code changed while it was running', async () => {
    mount()
    const done = pressRun()
    useStore.getState().setCode('x = 2\n')
    await vi.advanceTimersByTimeAsync(50)
    await done
    expect(lit()).toBe(false)
  })
})
