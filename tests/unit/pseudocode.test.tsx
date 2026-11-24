// Exam pseudocode: the worker plumbing and the panel. The translation itself is tested in test_pseudocode.py.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONVERT_DELAY_MS, DIALECT_KEY, PseudocodePanel } from '../../src/components/editor/PseudocodePanel'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import type { PseudoResult } from '../../src/core/pseudocode/types'
import type { TraceRunner } from '../../src/core/runner'
import { encodeShare } from '../../src/core/share/urlState'
import { DEFAULT_TRACE_OPTIONS } from '../../src/core/types'
import { defaultWorkspace } from '../../src/core/workspace'
import { HARD_KILL_GRACE_MS, PythonTraceRunner } from '../../src/languages/python/PythonTraceRunner'
import type { FromWorker, ToWorker } from '../../src/languages/python/protocol'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

class FakeWorker {
  sent: ToWorker[] = []
  onmessage: ((e: MessageEvent<FromWorker>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage(m: ToWorker) {
    this.sent.push(m)
    if (m.type === 'init') queueMicrotask(() => this.say({ type: 'status', status: 'ready' }))
  }
  terminate() {}
  say(m: FromWorker) {
    this.onmessage?.({ data: m } as MessageEvent<FromWorker>)
  }
  conversions() {
    return this.sent.filter((m): m is Extract<ToWorker, { type: 'pseudocode' }> => m.type === 'pseudocode')
  }
}

function pythonRunner() {
  const workers: FakeWorker[] = []
  const runner = new PythonTraceRunner('https://example.test/pyodide/', () => {
    const w = new FakeWorker()
    workers.push(w)
    return w as unknown as Worker
  })
  return { runner, workers }
}

const ok = (text: string, sourceLine: number | null = 1): PseudoResult => ({
  ok: true,
  dialect: 'aqa',
  lines: [{ text, indent: 0, sourceLine }],
})

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun()
  setRunnerOverride(null)
  vi.useRealTimers()
})

describe('PythonTraceRunner.toPseudocode', () => {
  it('sends one parse request and never a run', async () => {
    const { runner, workers } = pythonRunner()
    const promise = runner.toPseudocode('x = 1', 'ocr')
    await vi.advanceTimersByTimeAsync(0)
    const w = workers[0]!
    expect(w.sent.map((m) => m.type)).toEqual(['init', 'pseudocode'])
    const [request] = w.conversions()
    expect(request).toMatchObject({ code: 'x = 1', dialect: 'ocr' })
    w.say({ type: 'pseudocode-done', requestId: request!.requestId, result: ok('x = 1') })
    await expect(promise).resolves.toEqual(ok('x = 1'))
  })

  it('matches answers to requests, even out of order', async () => {
    const { runner, workers } = pythonRunner()
    const first = runner.toPseudocode('a = 1', 'aqa')
    const second = runner.toPseudocode('b = 2', 'aqa')
    await vi.advanceTimersByTimeAsync(0)
    const w = workers[0]!
    const [a, b] = w.conversions()
    w.say({ type: 'pseudocode-done', requestId: b!.requestId, result: ok('B') })
    w.say({ type: 'pseudocode-done', requestId: a!.requestId, result: ok('A') })
    await expect(first).resolves.toEqual(ok('A'))
    await expect(second).resolves.toEqual(ok('B'))
  })

  it('rejects a waiting request when a stuck run gets the worker killed, then works on the new one', async () => {
    const { runner, workers } = pythonRunner()
    await runner.init()
    const run = runner.runTrace('while True: pass', DEFAULT_TRACE_OPTIONS)
    await vi.advanceTimersByTimeAsync(0)
    const waiting = expect(runner.toPseudocode('x = 1', 'aqa')).rejects.toThrow('restarted')
    await vi.advanceTimersByTimeAsync(DEFAULT_TRACE_OPTIONS.timeoutMs + HARD_KILL_GRACE_MS)
    await waiting
    await expect(run).resolves.toMatchObject({ status: 'timeout' })

    const retry = runner.toPseudocode('x = 1', 'aqa')
    await vi.advanceTimersByTimeAsync(0)
    const w = workers[1]!
    w.say({ type: 'pseudocode-done', requestId: w.conversions()[0]!.requestId, result: ok('x ← 1') })
    await expect(retry).resolves.toMatchObject({ ok: true })
  })

  it('rejects waiting requests when the runtime fails or is disposed', async () => {
    const a = pythonRunner()
    const failed = expect(a.runner.toPseudocode('x', 'aqa')).rejects.toThrow('boom')
    await vi.advanceTimersByTimeAsync(0)
    a.workers[0]!.say({ type: 'fatal', message: 'boom' })
    await failed

    const b = pythonRunner()
    const disposed = expect(b.runner.toPseudocode('x', 'aqa')).rejects.toThrow('disposed')
    await vi.advanceTimersByTimeAsync(0)
    b.runner.dispose()
    await disposed
  })
})

type Convert = NonNullable<TraceRunner['toPseudocode']>

function panel(convert: Convert, state: Record<string, unknown> = {}) {
  const runner = Object.assign(new FakeTraceRunner(traces.digitSum), { toPseudocode: convert })
  const run = vi.spyOn(runner, 'runTrace')
  setRunnerOverride(runner)
  useStore.setState({ ...defaultWorkspace('n = 1234\n'), result: null, ranInput: null, shared: null, hoverStep: null, selectedStep: null, ...state })
  render(<PseudocodePanel />)
  return { run }
}

const toggle = () => screen.getByRole('button', { name: /Exam pseudocode/ })
const wait = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const lineItems = () => screen.queryAllByRole('listitem').map((li) => li.textContent)

describe('PseudocodePanel', () => {
  it('is not offered by a language that cannot convert', () => {
    setRunnerOverride(new FakeTraceRunner(traces.digitSum))
    const { container } = render(<PseudocodePanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('is closed by default and asks for nothing until opened, then waits for typing to pause', async () => {
    const convert = vi.fn<Convert>(async (code) => ok(code.trim()))
    panel(convert)
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    await wait(CONVERT_DELAY_MS * 3)
    expect(convert).not.toHaveBeenCalled()

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    for (const code of ['a = 1', 'a = 12', 'a = 123']) {
      act(() => useStore.setState({ code }))
      await wait(CONVERT_DELAY_MS - 1)
    }
    expect(convert).not.toHaveBeenCalled()
    await wait(1)
    expect(convert.mock.calls).toEqual([['a = 123', 'aqa']])
    expect(lineItems()).toEqual(['a = 123'])
  })

  it('ignores the answer to a request that a newer one replaced', async () => {
    const answers: ((r: PseudoResult) => void)[] = []
    panel(() => new Promise((resolve) => answers.push(resolve)))
    fireEvent.click(toggle())
    await wait(CONVERT_DELAY_MS)
    act(() => useStore.setState({ code: 'newer = 1' }))
    await wait(CONVERT_DELAY_MS)
    await act(async () => answers[1]!(ok('NEWER')))
    await act(async () => answers[0]!(ok('OLDER')))
    expect(lineItems()).toEqual(['NEWER'])
  })

  it('remembers the exam board, and falls back to AQA for a bad stored value', async () => {
    localStorage.setItem(DIALECT_KEY, 'nonsense')
    const convert = vi.fn<Convert>(async (_c, d) => ok(d))
    panel(convert)
    fireEvent.click(toggle())
    expect(screen.getByRole('radio', { name: 'AQA' })).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: 'SQA' }))
    await wait(CONVERT_DELAY_MS)
    expect(lineItems()).toEqual(['sqa'])
    expect(localStorage.getItem(DIALECT_KEY)).toBe('sqa')
  })

  it('shows a syntax error with its line and no pseudocode', async () => {
    panel(async () => ({ ok: false, message: 'This is not valid Python yet: bad', line: 3 }))
    fireEvent.click(toggle())
    await wait(CONVERT_DELAY_MS)
    expect(screen.getByRole('alert')).toHaveTextContent('Line 3: This is not valid Python yet')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('offers "Try again" when the request is rejected', async () => {
    const convert = vi.fn<Convert>().mockRejectedValueOnce(new Error('restarted')).mockResolvedValue(ok('x ← 1'))
    panel(convert)
    fireEvent.click(toggle())
    await wait(CONVERT_DELAY_MS)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await wait(CONVERT_DELAY_MS)
    expect(lineItems()).toEqual(['x ← 1'])
  })

  it('marks lines without an equivalent', async () => {
    panel(async () => ({
      ok: true,
      dialect: 'aqa',
      lines: [
        { text: 'break', indent: 1, sourceLine: 1, unsupported: true },
        { text: 'for c in w', indent: 0, sourceLine: 2, unsupported: true, note: 'special reason' },
      ],
    }))
    fireEvent.click(toggle())
    await wait(CONVERT_DELAY_MS)
    expect(lineItems()).toEqual(['breakno exam equivalent', 'for c in wspecial reason'])
  })

  it('converts the code behind the table (not the editor), says so, and highlights the selected line', async () => {
    const convert = vi.fn<Convert>(async () => ({
      ok: true,
      dialect: 'aqa',
      lines: [
        { text: 'first', indent: 0, sourceLine: 1 },
        { text: 'third', indent: 0, sourceLine: 3 },
        { text: 'ENDWHILE', indent: 0, sourceLine: null },
      ],
    }))
    const step = traces.digitSum.steps.findIndex((s) => s.lineNumber === 3)
    panel(convert, { result: traces.digitSum, ranInput: { code: 'what ran', stdin: [] }, code: 'edited since' })
    fireEvent.click(toggle())
    await wait(CONVERT_DELAY_MS)
    expect(convert).toHaveBeenCalledWith('what ran', 'aqa')
    expect(screen.getByRole('status')).toHaveTextContent('changed since the last run')

    act(() => useStore.setState({ selectedStep: step }))
    const [first, third, closer] = screen.getAllByRole('listitem')
    expect(third).toHaveAttribute('aria-current', 'true')
    expect(third!.className).toContain('bg-yellow-200')
    expect(first).not.toHaveAttribute('aria-current')
    expect(closer).not.toHaveAttribute('aria-current')

    act(() => useStore.setState({ selectedStep: null, hoverStep: step }))
    expect(screen.getAllByRole('listitem')[1]!.className).toContain('bg-yellow-100')
  })

  it('converts shared code under review without ever running it', async () => {
    const convert = vi.fn<Convert>(async () => ok('OUTPUT 1'))
    const { run } = panel(convert)
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('print(1)'))}`)
    act(() => useStore.getState().openSharedFromHash())
    fireEvent.click(toggle())
    await wait(CONVERT_DELAY_MS)
    expect(useStore.getState().shared).not.toBeNull()
    expect(convert).toHaveBeenCalledWith('print(1)', 'aqa')
    expect(run).not.toHaveBeenCalled()
  })
})
