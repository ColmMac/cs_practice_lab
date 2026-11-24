import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Value } from '../../src/core/types'
import { executionKey, hashString } from '../../src/core/executionKey'
import { DEFAULT_TRACE_OPTIONS } from '../../src/core/types'
import { formatPythonValue as f, pyStr } from '../../src/languages/python/format'
import { PYODIDE_VERSION } from '../../src/languages/python/protocol'

const int = (n: number): Value => ({ k: 'int', v: String(n) })
const str = (v: string): Value => ({ k: 'str', v })

describe('formatPythonValue (matches Python repr)', () => {
  it('scalars', () => {
    expect(f({ k: 'none' })).toBe('None')
    expect(f({ k: 'bool', v: true })).toBe('True')
    expect(f({ k: 'bool', v: false })).toBe('False')
    expect(f(int(-5))).toBe('-5')
    expect(f({ k: 'float', v: '0.30000000000000004' })).toBe('0.30000000000000004')
    expect(f({ k: 'float', v: 'inf' })).toBe('inf')
  })

  it('strings prefer single quotes, switch to double when needed, and escape', () => {
    expect(pyStr('hi')).toBe("'hi'")
    expect(pyStr("it's")).toBe(`"it's"`)
    expect(pyStr(`both ' and "`)).toBe(`'both \\' and "'`)
    expect(pyStr('a\nb\t\\')).toBe("'a\\nb\\t\\\\'")
    expect(f({ k: 'str', v: 'x', truncated: 500 })).toBe("'x'…")
  })

  it('containers', () => {
    expect(f({ k: 'list', items: [int(1), str('a')], ref: 1 })).toBe("[1, 'a']")
    expect(f({ k: 'list', items: [], ref: 1 })).toBe('[]')
    expect(f({ k: 'tuple', items: [int(1)], ref: 1 })).toBe('(1,)')
    expect(f({ k: 'tuple', items: [int(1), int(2)], ref: 1 })).toBe('(1, 2)')
    expect(f({ k: 'tuple', items: [], ref: 1 })).toBe('()')
    expect(f({ k: 'set', items: [], ref: 1 })).toBe('set()')
    expect(f({ k: 'set', items: [int(2)], ref: 1 })).toBe('{2}')
    expect(f({ k: 'frozenset', items: [int(2)], ref: 1 })).toBe('frozenset({2})')
    expect(f({ k: 'dict', entries: [[str('k'), { k: 'bool', v: true }]], ref: 1 })).toBe("{'k': True}")
    expect(f({ k: 'dict', entries: [], ref: 1 })).toBe('{}')
  })

  it('nesting, truncation, cycles, objects, opaque', () => {
    expect(f({ k: 'list', items: [{ k: 'list', items: [int(1)], ref: 2 }], ref: 1 })).toBe('[[1]]')
    expect(f({ k: 'list', items: [int(1)], ref: 1, truncated: 100 })).toBe('[1, …]')
    expect(f({ k: 'list', items: [{ k: 'cycle', ref: 1 }], ref: 1 })).toBe('[[...]]')
    expect(f({ k: 'object', type: 'P', fields: { x: int(1) }, ref: 1 })).toBe('P(x=1)')
    expect(f({ k: 'opaque', type: 'range', repr: 'range(0, 3)' })).toBe('range(0, 3)')
  })
})

describe('executionKey', () => {
  const key = (code: string, o = {}) => executionKey('python', code, { ...DEFAULT_TRACE_OPTIONS, ...o })

  it('is deterministic and sensitive to every input that changes the trace', () => {
    expect(key('x = 1')).toBe(key('x = 1'))
    expect(key('x = 1')).not.toBe(key('x = 2'))
    expect(key('x = 1')).not.toBe(key('x = 1', { stdin: ['a'] }))
    expect(key('x = 1')).not.toBe(key('x = 1', { randomSeed: 1 }))
    expect(key('x = 1')).not.toBe(key('x = 1', { maxSteps: 5 }))
  })

  it('ignores things that do not change the trace', () => {
    expect(key('x = 1')).toBe(key('x = 1', { timeoutMs: 9999 }))
  })

  it('hashString spreads small differences', () => {
    expect(hashString('a')).not.toBe(hashString('b'))
  })
})

describe('Pyodide pin', () => {
  it('CDN version constant equals the installed npm package (types + runtime must match)', () => {
    const pkg = JSON.parse(readFileSync('node_modules/pyodide/package.json', 'utf8')) as { version: string }
    expect(PYODIDE_VERSION).toBe(pkg.version)
  })
})
