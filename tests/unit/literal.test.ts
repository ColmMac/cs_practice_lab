import { describe, expect, it } from 'vitest'
import { compareValues } from '../../src/core/study/compare'
import { mulberry32 } from '../../src/core/study/rng'
import type { Value } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { looseParsePython, parsePythonAnswer, parsePythonValue, pyFloat } from '../../src/languages/python/literal'

/** Value without the bookkeeping fields (ref / truncated), for exact structural comparison. */
function strip(v: Value): unknown {
  switch (v.k) {
    case 'list':
    case 'tuple':
    case 'set':
    case 'frozenset':
      return { k: v.k, items: v.items.map(strip) }
    case 'dict':
      return { k: 'dict', entries: v.entries.map(([a, b]) => [strip(a), strip(b)]) }
    default:
      return v
  }
}
const parse = (text: string): unknown => {
  const r = parsePythonValue(text)
  if (!r.ok) throw new Error(`should parse: ${text}: ${r.error}`)
  return strip(r.value)
}
const fails = (text: string) => expect(parsePythonValue(text).ok, `should NOT parse: ${JSON.stringify(text)}`).toBe(false)

describe('parsePythonValue: scalars', () => {
  it('ints', () => {
    expect(parse('0')).toEqual({ k: 'int', v: '0' })
    expect(parse('42')).toEqual({ k: 'int', v: '42' })
    expect(parse('-42')).toEqual({ k: 'int', v: '-42' })
    expect(parse('+42')).toEqual({ k: 'int', v: '42' })
    expect(parse('1_000_000')).toEqual({ k: 'int', v: '1000000' })
    expect(parse('0xFF')).toEqual({ k: 'int', v: '255' })
    expect(parse('0o17')).toEqual({ k: 'int', v: '15' })
    expect(parse('0b101')).toEqual({ k: 'int', v: '5' })
    expect(parse('-0')).toEqual({ k: 'int', v: '0' })
    expect(parse('00')).toEqual({ k: 'int', v: '0' })
    expect(parse('123456789012345678901234567890')).toEqual({ k: 'int', v: '123456789012345678901234567890' })
  })

  it('floats', () => {
    expect(parse('3.14')).toEqual({ k: 'float', v: '3.14' })
    expect(parse('3.')).toEqual({ k: 'float', v: '3.0' })
    expect(parse('.5')).toEqual({ k: 'float', v: '0.5' })
    expect(parse('-.5')).toEqual({ k: 'float', v: '-0.5' })
    expect(parse('1e3')).toEqual({ k: 'float', v: '1000.0' })
    expect(parse('1.5E-3')).toEqual({ k: 'float', v: '0.0015' })
    expect(parse('007.5')).toEqual({ k: 'float', v: '7.5' }) // leading zeros are fine in floats
    expect(parse('inf')).toEqual({ k: 'float', v: 'inf' })
    expect(parse('-inf')).toEqual({ k: 'float', v: '-inf' })
    expect(parse('nan')).toEqual({ k: 'float', v: 'nan' })
    expect(parse('-0.0')).toEqual({ k: 'float', v: '-0.0' })
  })

  it('True / False / None', () => {
    expect(parse('True')).toEqual({ k: 'bool', v: true })
    expect(parse('False')).toEqual({ k: 'bool', v: false })
    expect(parse('None')).toEqual({ k: 'none' })
  })

  it('strings and every escape', () => {
    expect(parse("'hi'")).toEqual({ k: 'str', v: 'hi' })
    expect(parse('"hi"')).toEqual({ k: 'str', v: 'hi' })
    expect(parse("'''tri\nple'''")).toEqual({ k: 'str', v: 'tri\nple' })
    expect(parse('"""a "quoted" bit"""')).toEqual({ k: 'str', v: 'a "quoted" bit' })
    expect(parse("'a\\nb\\tc\\\\d\\'e\\\"f'")).toEqual({ k: 'str', v: 'a\nb\tc\\d\'e"f' })
    expect(parse("'\\x41\\u00e9\\U0001F600'")).toEqual({ k: 'str', v: 'Aé😀' })
    expect(parse("'\\101'")).toEqual({ k: 'str', v: 'A' })
    expect(parse("'\\0'")).toEqual({ k: 'str', v: '\0' })
    expect(parse("'\\q'")).toEqual({ k: 'str', v: '\\q' }) // unknown escapes keep the backslash
    expect(parse("'a\\\nb'")).toEqual({ k: 'str', v: 'ab' }) // line continuation
    expect(parse("r'\\n'")).toEqual({ k: 'str', v: '\\n' })
    expect(parse("u'x'")).toEqual({ k: 'str', v: 'x' })
    expect(parse("'a' 'b'  \"c\"")).toEqual({ k: 'str', v: 'abc' })
    expect(parse("('a'\n 'b')")).toEqual({ k: 'str', v: 'ab' })
  })
})

describe('parsePythonValue: containers', () => {
  it('lists, with trailing commas and newlines', () => {
    expect(parse('[]')).toEqual({ k: 'list', items: [] })
    expect(parse('[1, 2,]')).toEqual({ k: 'list', items: [{ k: 'int', v: '1' }, { k: 'int', v: '2' }] })
    expect(parse('[\n  1,\n  [2],\n]')).toMatchObject({ items: [{ v: '1' }, { k: 'list' }] })
  })

  it('tuples: (), (1,), (1, 2), bare 1, 2, and grouping (1)', () => {
    expect(parse('()')).toEqual({ k: 'tuple', items: [] })
    expect(parse('(1,)')).toEqual({ k: 'tuple', items: [{ k: 'int', v: '1' }] })
    expect(parse('(1, 2)')).toMatchObject({ k: 'tuple' })
    expect(parse('1, 2')).toMatchObject({ k: 'tuple', items: [{ v: '1' }, { v: '2' }] })
    expect(parse('1,')).toMatchObject({ k: 'tuple', items: [{ v: '1' }] })
    expect(parse('(1)')).toEqual({ k: 'int', v: '1' })
    expect(parse('((1, 2))')).toMatchObject({ k: 'tuple', items: [{ v: '1' }, { v: '2' }] })
  })

  it('dicts, with duplicate keys keeping the last value', () => {
    expect(parse('{}')).toEqual({ k: 'dict', entries: [] })
    expect(parse("{'a': 1, 2: [3],}")).toMatchObject({ k: 'dict', entries: [[{ v: 'a' }, { v: '1' }], [{ v: '2' }, { k: 'list' }]] })
    expect(parse("{'a': 1, 'a': 2}")).toEqual({ k: 'dict', entries: [[{ k: 'str', v: 'a' }, { k: 'int', v: '2' }]] })
  })

  it('sets and frozensets, de-duplicated', () => {
    expect(parse('{1, 2, 2, 1}')).toMatchObject({ k: 'set', items: [{ v: '1' }, { v: '2' }] })
    expect(parse('set()')).toEqual({ k: 'set', items: [] })
    expect(parse('set([3, 3])')).toMatchObject({ k: 'set', items: [{ v: '3' }] })
    expect(parse('frozenset()')).toEqual({ k: 'frozenset', items: [] })
    expect(parse('frozenset({1, 2})')).toMatchObject({ k: 'frozenset', items: [{ v: '1' }, { v: '2' }] })
    expect(parse('set((1,))')).toMatchObject({ k: 'set' })
  })
})

describe('parsePythonValue: rejects what Python would reject (and never evaluates)', () => {
  it.each([
    '', '   ', '1 +', '1 2', 'hi', 'True False', '[1, 2', '1, 2)', '(1, 2', '{1: 2, 3}', '{1, 2: 3}', "'unterminated", '"no close',
    "'line\nbreak'", '007', '1__0 x', '3abc', '1j', '0x', 'foo()', 'print(1)', '__import__("os")', '[x for x in y]', 'lambda: 1',
    '1 if True else 2', '[1,, 2]', '[,]', '{,}', '-', '--5', '- hi', 'set(1)', 'set(1, 2)', "'\\xZZ'", "'\\u12'", "'\\U00110000'",
    'Infinity', 'NaN', 'true', 'none', 'b"bytes"', 'f"{1}"', '`x`', '1;2', '@', 'None.x', '1.2.3', 'x = 1', '[1] [2]',
  ])('%j', (text) => fails(text))

  it('enforces length and nesting limits without throwing', () => {
    fails('1'.repeat(2001))
    fails('['.repeat(41) + ']'.repeat(41))
    expect(parsePythonValue('['.repeat(40) + ']'.repeat(40)).ok).toBe(true)
    expect(() => parsePythonValue('['.repeat(100000))).not.toThrow()
    fails('('.repeat(1999))
  })

  it('parsePythonAnswer returns raw text on failure', () => {
    expect(parsePythonAnswer('[1')).toEqual({ ok: false, raw: '[1' })
    expect(parsePythonAnswer('[1]')).toMatchObject({ ok: true, value: { k: 'list' } })
  })
})

describe('pyFloat', () => {
  it.each([
    [3, '3.0'], [-3, '-3.0'], [0.5, '0.5'], [1e21, '1e+21'], [1e-7, '1e-7'], [NaN, 'nan'], [Infinity, 'inf'], [-Infinity, '-inf'],
    [-0, '-0.0'], [123456789012345680, '123456789012345680'], [0.1 + 0.2, '0.30000000000000004'],
  ])('%s → %s', (n, want) => expect(pyFloat(n)).toBe(want))
})

describe('looseParsePython (only for answers that are not valid Python)', () => {
  it('recognises capitalisation slips', () => {
    expect(looseParsePython('true')).toMatchObject({ value: { k: 'bool', v: true }, slip: expect.stringContaining('True') })
    expect(looseParsePython('FALSE')).toMatchObject({ value: { k: 'bool', v: false } })
    expect(looseParsePython('none')).toMatchObject({ value: { k: 'none' } })
    expect(looseParsePython('null')).toMatchObject({ value: { k: 'none' } })
  })

  it('treats bare words as strings and shows how to write them', () => {
    expect(looseParsePython('hi')).toEqual({ value: { k: 'str', v: 'hi' }, slip: "Strings need quotes: write 'hi'." })
    expect(looseParsePython('hello world')?.value).toEqual({ k: 'str', v: 'hello world' })
    expect(looseParsePython("it's")).toBeNull() // has a quote: not a bare word
  })

  it('a hyphenated or dotted word is still just an unquoted string', () => {
    expect(looseParsePython('well-known')?.value).toEqual({ k: 'str', v: 'well-known' })
    expect(looseParsePython('-hi')?.value).toEqual({ k: 'str', v: '-hi' })
    expect(looseParsePython('e.g')?.value).toEqual({ k: 'str', v: 'e.g' })
  })

  it('declines anything that looks like structure or a number', () => {
    for (const t of ['[a, b]', '{x}', '(1', '1 2', '3abc', '.5x', 'a:b', 'a,b', '', '   ']) expect(looseParsePython(t), t).toBeNull()
  })
})

// ───────────── round-trip property: parse(format(v)) ≡ v ─────────────

describe('property: parse(formatPythonValue(v)) reproduces v', () => {
  const rng = mulberry32(20261124)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rng() * xs.length)]!
  const WEIRD = ['', ' ', "'", '"', "'\"", '\\', '\\n', '\n', '\t', '\r', '\x00', '\x1f', '\x7f', 'é', 'ß', '漢字', '😀', ' ', 'a b', '  lead', 'trail  ', '\\x41', "it's", 'say "hi"', "both ' and \"", '{[(', ':,;']

  const randString = (): string => {
    const n = Math.floor(rng() * 6)
    let s = ''
    for (let i = 0; i < n; i++) s += rng() < 0.5 ? pick(WEIRD) : String.fromCharCode(32 + Math.floor(rng() * 95))
    return s
  }
  const randInt = (): Value => {
    const big = rng() < 0.2
    const n = BigInt(Math.floor((rng() - 0.5) * 2e6)) * (big ? 10n ** 15n : 1n) + BigInt(Math.floor(rng() * 10))
    return { k: 'int', v: n.toString() }
  }
  const randFloat = (): Value => {
    const specials = [0, -0, 0.1, 0.5, 1e22, 1e-7, 5e-324, 1.7976931348623157e308, 123456789.125, -2.5e-10, Infinity, -Infinity, NaN]
    const n = rng() < 0.3 ? pick(specials) : (rng() - 0.5) * 10 ** Math.floor(rng() * 12 - 4)
    return { k: 'float', v: pyFloat(n) }
  }

  function randValue(depth: number): Value {
    const leaf = depth <= 0 || rng() < 0.45
    const r = rng()
    if (leaf) {
      if (r < 0.1) return { k: 'none' }
      if (r < 0.25) return { k: 'bool', v: rng() < 0.5 }
      if (r < 0.5) return randInt()
      if (r < 0.7) return randFloat()
      return { k: 'str', v: randString() }
    }
    const n = Math.floor(rng() * 4)
    const items = Array.from({ length: n }, () => randValue(depth - 1))
    if (r < 0.3) return { k: 'list', items, ref: 1 }
    if (r < 0.5) return { k: 'tuple', items, ref: 1 }
    // sets and dict keys must be unique
    const unique = (vs: Value[]) => vs.filter((v, i) => vs.findIndex((w) => compareValues(w, v).kind === 'equal') === i)
    if (r < 0.7) return { k: pick(['set', 'frozenset'] as const), items: unique(items), ref: 1 }
    const keys = unique(Array.from({ length: n }, () => (rng() < 0.5 ? randInt() : ({ k: 'str', v: randString() } as Value))))
    return { k: 'dict', entries: keys.map((k) => [k, randValue(depth - 1)] as [Value, Value]), ref: 1 }
  }

  it('holds for 1500 random values (all kinds, nested, awkward strings, special floats)', () => {
    for (let i = 0; i < 1500; i++) {
      const v = randValue(3)
      const text = formatPythonValue(v)
      const r = parsePythonValue(text)
      expect(r.ok, `parse failed for ${text}`).toBe(true)
      if (!r.ok) return
      expect(strip(r.value), `round-trip changed ${text}`).toEqual(strip(v))
      // and the grader agrees the answer equals the truth
      expect(compareValues(r.value, v).kind, text).toBe('equal')
    }
  })

  it('format → parse → format is a fixed point', () => {
    for (let i = 0; i < 500; i++) {
      const text = formatPythonValue(randValue(3))
      const r = parsePythonValue(text)
      expect(r.ok && formatPythonValue(r.value)).toBe(text)
    }
  })
})
