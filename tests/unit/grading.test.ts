import { describe, expect, it } from 'vitest'
import { compareValues, floatsEqual } from '../../src/core/study/compare'
import { gradeAnswer, normalizeAnswer, outputLines, type GradingLanguage } from '../../src/core/study/grade'
import type { Grade, GradeState, Truth } from '../../src/core/study/types'
import type { Value } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { looseParsePython, parsePythonAnswer } from '../../src/languages/python/literal'

const lang: GradingLanguage = { formatValue: formatPythonValue, parseAnswer: parsePythonAnswer, looseParse: looseParsePython }

// ───────────── tiny Value builders ─────────────
const I = (n: number | string): Value => ({ k: 'int', v: String(n) })
const F = (v: string): Value => ({ k: 'float', v })
const S = (v: string): Value => ({ k: 'str', v })
const B = (v: boolean): Value => ({ k: 'bool', v })
const N: Value = { k: 'none' }
const L = (...items: Value[]): Value => ({ k: 'list', items, ref: 1 })
const T = (...items: Value[]): Value => ({ k: 'tuple', items, ref: 1 })
const SET = (...items: Value[]): Value => ({ k: 'set', items, ref: 1 })
const FSET = (...items: Value[]): Value => ({ k: 'frozenset', items, ref: 1 })
const D = (...entries: [Value, Value][]): Value => ({ k: 'dict', entries, ref: 1 })
const val = (v: Value): Truth => ({ kind: 'value', value: v })
const out = (text: string): Truth => ({ kind: 'output', text })

type Row = [answer: string, truth: Truth, expected: GradeState, messageFragment?: RegExp]
const run = (rows: Row[]) =>
  it.each(rows.map((r) => [r[0], formatTruth(r[1]), r] as const))('%j vs %s', (_a, _t, [answer, truth, expected, fragment]) => {
    const g = gradeAnswer(answer, truth, lang)
    expect(g.state, g.message).toBe(expected)
    if (fragment) expect(g.message).toMatch(fragment)
  })
const formatTruth = (t: Truth) => (t.kind === 'output' ? `output ${JSON.stringify(t.text)}` : formatPythonValue(t.value))

// ───────────── the exit-criterion table ─────────────

describe('grading: strings (quote style never matters)', () => {
  run([
    ["'hi'", val(S('hi')), 'correct'],
    ['"hi"', val(S('hi')), 'correct'],
    ["  'hi'  ", val(S('hi')), 'correct'],
    ["'hi '", val(S('hi')), 'incorrect'],
    ["'Hi'", val(S('hi')), 'incorrect'],
    ['hi', val(S('hi')), 'close', /Strings need quotes: write 'hi'/],
    ['hello world', val(S('hello world')), 'close', /Strings need quotes/],
    ['hi', val(S('ho')), 'incorrect'],
    ['"it\'s"', val(S("it's")), 'correct'],
    ["'it\\'s'", val(S("it's")), 'correct'],
    ["'a\\nb'", val(S('a\nb')), 'correct'],
    ["''", val(S('')), 'correct'],
    ["'ab' 'c'", val(S('abc')), 'correct'],
    ["r'a\\b'", val(S('a\\b')), 'correct'],
    ["'caf\\xe9'", val(S('café')), 'correct'],
    ["'hi", val(S('hi')), 'incorrect', /Couldn’t read/],
  ])
})

describe('grading: numbers (3 vs 3.0 is a classic slip, not a wrong answer)', () => {
  run([
    ['3', val(I(3)), 'correct'],
    ['-2', val(I(-2)), 'correct'],
    ['- 2', val(I(-2)), 'correct'],
    ['+7', val(I(7)), 'correct'],
    ['1_000', val(I(1000)), 'correct'],
    ['0x10', val(I(16)), 'correct'],
    ['4', val(I(3)), 'incorrect'],
    ['3.0', val(I(3)), 'close', /should be an int/],
    ['3', val(F('3.0')), 'close', /should be a float/],
    ['3.0', val(F('3.0')), 'correct'],
    ['3.00', val(F('3.0')), 'correct'],
    ['3.', val(F('3.0')), 'correct'],
    ['.5', val(F('0.5')), 'correct'],
    ['1e3', val(F('1000.0')), 'correct'],
    ['2.5', val(F('2.5')), 'correct'],
    ['2.6', val(F('2.5')), 'incorrect'],
    ['0.30000000000000004', val(F('0.30000000000000004')), 'correct'],
    ['0.3', val(F('0.30000000000000004')), 'correct'], // within 1e-9 relative: a rounded answer to a float sum is fine
    ['0.31', val(F('0.30000000000000004')), 'incorrect'],
    ['inf', val(F('inf')), 'correct'],
    ['-inf', val(F('-inf')), 'correct'],
    ['inf', val(F('-inf')), 'incorrect'],
    ['nan', val(F('nan')), 'correct'],
    ['12345678901234567890', val(I('12345678901234567890')), 'correct'],
    ['12345678901234567891', val(I('12345678901234567890')), 'incorrect'],
    ['007', val(I(7)), 'incorrect', /Couldn’t read/],
    ['3abc', val(I(3)), 'incorrect', /Couldn’t read/],
    ['1', val(B(true)), 'incorrect'],
    ['True', val(I(1)), 'incorrect'],
  ])
})

describe('grading: True / False / None (capitalisation is a slip)', () => {
  run([
    ['True', val(B(true)), 'correct'],
    ['False', val(B(false)), 'correct'],
    ['true', val(B(true)), 'close', /True, with a capital/],
    ['TRUE', val(B(true)), 'close', /True/],
    ['false', val(B(false)), 'close', /False, with a capital/],
    ['False', val(B(true)), 'incorrect'],
    ['false', val(B(true)), 'incorrect'], // a slip can't rescue a wrong value
    ['None', val(N), 'correct'],
    ['none', val(N), 'close', /None, with a capital N/],
    ['null', val(N), 'close'],
    ['None', val(B(false)), 'incorrect'],
    ['0', val(B(false)), 'incorrect'],
  ])
})

describe('grading: lists and tuples (spacing never matters; the bracket kind is a slip)', () => {
  run([
    ['[1,2]', val(L(I(1), I(2))), 'correct'],
    ['[1, 2]', val(L(I(1), I(2))), 'correct'],
    ['[ 1 ,2 , ]', val(L(I(1), I(2))), 'correct'],
    ['[\n 1,\n 2\n]', val(L(I(1), I(2))), 'correct'],
    ['[2, 1]', val(L(I(1), I(2))), 'incorrect'],
    ['[1, 2, 3]', val(L(I(1), I(2))), 'incorrect'],
    ['[1]', val(L(I(1), I(2))), 'incorrect'],
    ['[]', val(L()), 'correct'],
    ['[[1, 2], [3]]', val(L(L(I(1), I(2)), L(I(3)))), 'correct'],
    ["['a', \"b\"]", val(L(S('a'), S('b'))), 'correct'],
    ['(1, 2)', val(L(I(1), I(2))), 'close', /should be a list, written with \[ \]/],
    ['[1, 2]', val(T(I(1), I(2))), 'close', /should be a tuple, written with \( \)/],
    ['(1, 2)', val(T(I(1), I(2))), 'correct'],
    ['1, 2', val(T(I(1), I(2))), 'correct'],
    ['(1,)', val(T(I(1))), 'correct'],
    ['(1)', val(T(I(1))), 'incorrect'], // (1) is just the number 1
    ['()', val(T()), 'correct'],
    ['[1, 2.0]', val(L(I(1), I(2))), 'close', /int/], // a slip inside an element still shows
    ['[1, 3.0]', val(L(I(1), I(2))), 'incorrect'],
    ['[hi]', val(L(S('hi'))), 'incorrect', /Couldn’t read/],
    ['[1, 2', val(L(I(1), I(2))), 'incorrect', /Couldn’t read/],
  ])
})

describe('grading: dicts and sets (order never matters)', () => {
  const ab = D([S('a'), I(1)], [S('b'), I(2)])
  run([
    ["{'a': 1, 'b': 2}", val(ab), 'correct'],
    ["{'b': 2, 'a': 1}", val(ab), 'correct'],
    ['{"a": 1, "b": 2}', val(ab), 'correct'],
    ["{'a':1,'b':2,}", val(ab), 'correct'],
    ["{'a': 1}", val(ab), 'incorrect'],
    ["{'a': 1, 'b': 3}", val(ab), 'incorrect'],
    ["{'a': 1, 'c': 2}", val(ab), 'incorrect'],
    ["{'a': 1.0, 'b': 2}", val(ab), 'close', /int/],
    ["{'a': 1, 'a': 2}", val(D([S('a'), I(2)])), 'correct'], // later duplicate key wins, like Python
    ['{}', val(D()), 'correct'],
    ['{1, 2}', val(SET(I(2), I(1))), 'correct'],
    ['{2, 1, 1}', val(SET(I(1), I(2))), 'correct'],
    ['{1, 2, 3}', val(SET(I(1), I(2))), 'incorrect'],
    ['set()', val(SET()), 'correct'],
    ['{}', val(SET()), 'incorrect'], // {} is an empty dict, the classic trap
    ['[1, 2]', val(SET(I(1), I(2))), 'close', /should be a set, written with \{ \}/],
    ['{1, 2}', val(L(I(1), I(2))), 'close', /should be a list/],
    ['frozenset({1})', val(FSET(I(1))), 'correct'],
    ['{1}', val(FSET(I(1))), 'close', /frozenset/],
    ['set([1, 2])', val(SET(I(1), I(2))), 'correct'],
  ])
})

describe('grading: output lines (compared line by line, trailing whitespace ignored)', () => {
  run([
    ['10', out('10'), 'correct'],
    ['10   ', out('10'), 'correct'],
    ['10\n', out('10'), 'correct'],
    ['Vowels: 5', out('Vowels: 5'), 'correct'],
    ['vowels: 5', out('Vowels: 5'), 'close', /capital letters and spaces/],
    ['Vowels:  5', out('Vowels: 5'), 'close', /exactly/],
    ['Vowels: 6', out('Vowels: 5'), 'incorrect'],
    ['a\\nb', out('a\nb'), 'correct'], // a one-line cell: \n separates lines
    ['a\nb', out('a\nb'), 'correct'],
    ['a  \nb ', out('a\nb'), 'correct'],
    ['a b', out('a\nb'), 'incorrect'], // one line is not two
    ['a\\nb', out('a'), 'incorrect'],
    ['⏎', out('⏎'), 'correct'], // a printed blank line
    ['Enter a word: education', out('Enter a word: education'), 'correct'],
    ['  indented', out('  indented'), 'correct'], // leading space is significant…
    ['indented', out('  indented'), 'close', /exactly/], // …so leaving it out is a slip, not a pass
  ])
})

describe('grading: objects (compared as text, since they can’t be typed as a literal)', () => {
  const obj: Value = { k: 'object', type: 'P', fields: { x: I(1) }, ref: 1 }
  run([
    ['P(x=1)', val(obj), 'correct'],
    ['P(x=2)', val(obj), 'incorrect'],
    ['P(x=1)', val({ k: 'opaque', type: 'range', repr: 'range(0, 3)' }), 'incorrect'],
    ['range(0, 3)', val({ k: 'opaque', type: 'range', repr: 'range(0, 3)' }), 'correct'],
    ['range(0,   3)', val({ k: 'opaque', type: 'range', repr: 'range(0, 3)' }), 'correct'], // runs of spaces collapse
  ])
})

describe('grading: blanks and honesty', () => {
  run([
    ['', val(I(1)), 'incorrect', /No answer/],
    ['   ', val(S('x')), 'incorrect', /No answer/],
    ['', out('x'), 'incorrect', /No answer/],
  ])

  it('a plain wrong answer carries no message (the label already says "Not correct")', () => {
    for (const [answer, truth] of [['4', val(I(3))], ["'no'", val(S('yes'))], ['Vowels: 6', out('Vowels: 5')]] as [string, Truth][]) {
      expect(gradeAnswer(answer, truth, lang)).toEqual({ state: 'incorrect' })
    }
  })

  it('never leaks the ground truth in a message', () => {
    const cases: [string, Truth][] = [
      ['4', val(I(31337))],
      ["'no'", val(S('secret'))],
      ['[9]', val(L(I(31337)))],
      ['nope', out('secret')],
    ]
    for (const [answer, truth] of cases) {
      const g: Grade = gradeAnswer(answer, truth, lang)
      expect(g.state).toBe('incorrect')
      expect(g.message ?? '').not.toMatch(/31337|secret/)
    }
  })

  it('never throws on hostile input', () => {
    const hostile = ['[' .repeat(5000), '{'.repeat(100), "'" + 'x'.repeat(10000), '\u0000', '💥', '1' + 'e999999', '(((((((((((((((((((((((((((((((((((((((((((((((((((((1)))))))))))))))))))))))))))))))))))))))))))))))))))))']
    for (const h of hostile) expect(() => gradeAnswer(h, val(I(1)), lang)).not.toThrow()
    for (const h of hostile) expect(gradeAnswer(h, val(I(1)), lang).state).toBe('incorrect')
  })
})

// ───────────── the comparison and helpers underneath ─────────────

describe('compareValues', () => {
  it('ignores ref and truncated markers', () => {
    expect(compareValues({ k: 'list', items: [I(1)], ref: 1 }, { k: 'list', items: [I(1)], ref: 99, truncated: 3 }).kind).toBe('equal')
  })

  it('matches unordered collections one-to-one (no item can be used twice)', () => {
    expect(compareValues(SET(I(1), I(1)), SET(I(1), I(2))).kind).toBe('different')
    expect(compareValues(L(I(1), I(1)), SET(I(1), I(2))).kind).toBe('different')
  })

  it('prefers an exact match over a close one when both are available', () => {
    // truth {1, 2.0}: the student's [2.0, 1] must pair 1↔1 exactly, 2.0↔2.0 exactly, leaving only the list/set slip
    const m = compareValues(L(F('2.0'), I(1)), SET(I(1), F('2.0')))
    expect(m).toMatchObject({ kind: 'close', why: expect.stringMatching(/set/) })
  })

  it('dict keys must match exactly (1 and 1.0 are not interchangeable keys here)', () => {
    expect(compareValues(D([F('1.0'), S('a')]), D([I(1), S('a')])).kind).toBe('different')
  })

  it('different kinds are different', () => {
    expect(compareValues(S('1'), I(1)).kind).toBe('different')
    expect(compareValues(N, B(false)).kind).toBe('different')
    expect(compareValues(L(), D()).kind).toBe('different')
  })
})

describe('floatsEqual', () => {
  it.each([
    [1, 1, true],
    [0.1 + 0.2, 0.3, true],
    [1e-300, 1e-300 * (1 + 1e-12), true],
    [1, 1.0000001, false],
    [NaN, NaN, true],
    [Infinity, Infinity, true],
    [Infinity, -Infinity, false],
    [Infinity, 1e308, false],
    [0, 1e-12, false], // relative tolerance: nothing is "close to zero" except zero
    [0, 0, true],
  ])('%s vs %s → %s', (x, y, want) => expect(floatsEqual(x, y)).toBe(want))
})

describe('normalizeAnswer / outputLines', () => {
  it('collapses spaces outside quotes only', () => {
    expect(normalizeAnswer('  a   b \t c ')).toBe('a b c')
    expect(normalizeAnswer("x   '  keep   this  '   y")).toBe("x '  keep   this  ' y")
    expect(normalizeAnswer('x "a\\"  b"   y')).toBe('x "a\\"  b" y')
    expect(normalizeAnswer('a\r\nb')).toBe('a\nb')
  })

  it('outputLines trims trailing whitespace and trailing blank lines', () => {
    expect(outputLines('a  \nb\n\n')).toEqual(['a', 'b'])
    expect(outputLines('')).toEqual([])
    expect(outputLines('⏎')).toEqual([])
    expect(outputLines('\nx')).toEqual(['', 'x']) // a leading blank line is real output
  })
})
