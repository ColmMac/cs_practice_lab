import { describe, expect, it } from 'vitest'
import { traces } from './fixtures'

describe('materialise (real tracer output → TraceResult)', () => {
  it('maps status, stdout and per-step basics', () => {
    const r = traces.digitSum
    expect(r.status).toBe('ok')
    expect(r.stdout).toBe('10\n')
    expect(r.steps).toHaveLength(20)
    expect(r.steps[0]).toMatchObject({ stepIndex: 0, kind: 'line', lineNumber: 1, lineSource: 'n = 1234' })
    expect(r.steps[0]!.frame).toMatchObject({ id: 0, name: '<module>', depth: 0 })
  })

  it('rebuilds FULL scope state from deltas on every step', () => {
    const last = traces.digitSum.steps.at(-1)!
    expect(last.scopes).toHaveLength(1)
    expect(last.scopes[0]!.vars).toEqual({
      n: { k: 'int', v: '0' },
      total: { k: 'int', v: '10' },
      digit: { k: 'int', v: '1' }, // last digit peeled off 1234
    })
  })

  it('shares unchanged objects between steps (structural sharing)', () => {
    // steps 2 (`while n > 0`) and 3 (`digit = n % 10`) leave total = 0 untouched; step 4 changes it
    const [s2, s3, s4] = [2, 3, 4].map((i) => traces.digitSum.steps[i]!)
    expect(s2!.scopes[0]!.vars.total).toBe(s3!.scopes[0]!.vars.total)
    expect(s3!.scopes[0]!.vars.total).not.toBe(s4!.scopes[0]!.vars.total)
  })

  it('exposes the call stack and every live frame during recursion', () => {
    const deepest = traces.factorial.steps.reduce((m, s) => (s.callStack.length > m.callStack.length ? s : m))
    expect(deepest.callStack.map((f) => f.name)).toEqual(['<module>', 'fact', 'fact', 'fact'])
    expect(deepest.callStack.map((f) => f.depth)).toEqual([0, 1, 2, 3])
    // each live frame keeps its OWN n
    expect(deepest.scopes.slice(1).map((s) => s.vars.n)).toEqual([
      { k: 'int', v: '3' },
      { k: 'int', v: '2' },
      { k: 'int', v: '1' },
    ])
  })

  it('call rows carry arguments; explicit returns carry values', () => {
    const r = traces.factorial
    expect(r.steps.filter((s) => s.kind === 'call').map((s) => s.frame.argsLabel)).toEqual([
      'fact(n=3)',
      'fact(n=2)',
      'fact(n=1)',
    ])
    expect(r.steps.filter((s) => s.kind === 'return').map((s) => s.returnValue)).toEqual([
      { k: 'int', v: '1' },
      { k: 'int', v: '2' },
      { k: 'int', v: '6' },
    ])
    expect(r.functions).toEqual(['fact'])
  })

  it('maps runtime errors onto the failing row', () => {
    const r = traces.zeroDivision
    expect(r.status).toBe('runtime-error')
    expect(r.error).toMatchObject({ type: 'ZeroDivisionError', line: 2 })
    expect(r.steps.at(-1)).toMatchObject({
      kind: 'exception',
      exception: { type: 'ZeroDivisionError', caught: false },
    })
  })

  it('keeps the partial trace for step-limit stops', () => {
    const r = traces.infiniteLoop
    expect(r.status).toBe('step-limit')
    expect(r.steps.length).toBeGreaterThan(0)
    expect(r.error?.message).toMatch(/infinite loop/)
  })

  it('represents syntax errors with a position and no rows', () => {
    const r = traces.syntaxError
    expect(r.status).toBe('syntax-error')
    expect(r.error).toMatchObject({ type: 'SyntaxError', line: 1 })
    expect(r.steps).toEqual([])
  })

  it('surfaces the pending input() request', () => {
    expect(traces.needsInput.status).toBe('awaiting-input')
    expect(traces.needsInput.inputRequest).toEqual({ prompt: 'Name? ', consumedCount: 0 })
  })

  it('gives an executionKey that changes with the code', () => {
    expect(traces.digitSum.executionKey).not.toBe(traces.factorial.executionKey)
    expect(traces.digitSum.executionKey).toMatch(/^[0-9a-z]+$/)
  })
})
