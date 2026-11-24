import { describe, expect, it } from 'vitest'
import { applyColumnPrefs, deriveColumns } from '../../src/core/derive/columns'
import { deriveRows, type RowOptions } from '../../src/core/derive/rows'
import { hintFor } from '../../src/core/study/hint'
import { maskableCells, selectMasks } from '../../src/core/study/mask'
import { mulberry32, newSeed, shuffled } from '../../src/core/study/rng'
import { formatPoints, summarise } from '../../src/core/study/score'
import { DEFAULT_STUDY_CONFIG, cellKey, type Grade, type StudyConfig, type Truth } from '../../src/core/study/types'
import type { TraceResult, Value, WatchExpression } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { traces } from './fixtures'

const cfg = (c: Partial<StudyConfig> = {}): StudyConfig => ({ ...DEFAULT_STUDY_CONFIG, ...c })

function cellsOf(result: TraceResult, options: RowOptions = { granularity: 'compact', display: 'exam' }, watches: WatchExpression[] = []) {
  const columns = applyColumnPrefs(deriveColumns(result, { watches }), { hidden: ['stack'], order: [] })
  const rows = deriveRows(result, columns, formatPythonValue, options)
  return { columns, rows, cells: maskableCells(rows, columns) }
}

describe('mulberry32 / shuffled / newSeed', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const seqA = Array.from({ length: 1000 }, () => a())
    expect(seqA).toEqual(Array.from({ length: 1000 }, () => b()))
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true)
  })

  it('different seeds give different sequences, with a sane spread', () => {
    const a = Array.from({ length: 5 }, mulberry32(1))
    const b = Array.from({ length: 5 }, mulberry32(2))
    expect(a).not.toEqual(b)
    const r = mulberry32(7)
    const mean = Array.from({ length: 10000 }, () => r()).reduce((s, x) => s + x, 0) / 10000
    expect(mean).toBeGreaterThan(0.48)
    expect(mean).toBeLessThan(0.52)
  })

  it('shuffled returns a permutation, repeatably, without touching its input', () => {
    const input = Array.from({ length: 50 }, (_, i) => i)
    const copy = [...input]
    const s1 = shuffled(input, mulberry32(9))
    expect(input).toEqual(copy)
    expect([...s1].sort((x, y) => x - y)).toEqual(input)
    expect(s1).toEqual(shuffled(input, mulberry32(9)))
    expect(s1).not.toEqual(input)
  })

  it('newSeed is a 32-bit unsigned integer', () => {
    for (let i = 0; i < 100; i++) {
      const s = newSeed()
      expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true)
    }
  })
})

describe('maskableCells: only what the program WRITES, never Line or Call stack', () => {
  it('digit-sum has exactly 15 questions (every compact row writes exactly one cell)', () => {
    const { cells, rows } = cellsOf(traces.digitSum)
    expect(rows).toHaveLength(15)
    expect(cells).toHaveLength(15)
    expect(new Set(cells.map((c) => c.key)).size).toBe(15)
    const byCol = (id: string) => cells.filter((c) => c.colId === id).length
    expect([byCol('<module>:n'), byCol('<module>:total'), byCol('<module>:digit'), byCol('output')]).toEqual([5, 5, 4, 1])
    expect(cells.some((c) => c.colId === 'line' || c.colId === 'stack')).toBe(false)
  })

  it('keys are `${stepIndex}:${columnId}` and carry the ground truth', () => {
    const { cells } = cellsOf(traces.digitSum)
    const first = cells[0]!
    expect(first.key).toBe(cellKey(first.stepIndex, first.colId))
    expect(first.truth).toEqual({ kind: 'value', value: { k: 'int', v: '1234' } })
    const output = cells.find((c) => c.colId === 'output')!
    expect(output.truth).toEqual({ kind: 'output', text: '10' })
  })

  it('"carry forward" shows more cells but asks the same questions (carried values are context)', () => {
    expect(cellsOf(traces.digitSum, { granularity: 'compact', display: 'carry' }).cells.map((c) => c.key)).toEqual(
      cellsOf(traces.digitSum).cells.map((c) => c.key),
    )
  })

  it('"every line" adds condition rows but no questions', () => {
    const everyLine = cellsOf(traces.digitSum, { granularity: 'every-line', display: 'exam' })
    expect(everyLine.rows).toHaveLength(20)
    expect(everyLine.cells).toHaveLength(15)
  })

  it('return values are questions; the call stack column is not', () => {
    const { cells } = cellsOf(traces.factorial)
    const returns = cells.filter((c) => c.colId === 'return').map((c) => formatPythonValue((c.truth as { value: Value }).value))
    expect(returns).toEqual(['1', '2', '6'])
    expect(cells.some((c) => c.colId === 'stack')).toBe(false)
  })

  it('a watch is a question when it has a value, and not when it failed', () => {
    const watches: WatchExpression[] = [
      { id: 'cur', expr: 'n', scope: { kind: 'current' }, enabled: true },
      { id: 'bad', expr: 'result.pop()', scope: { kind: 'module' }, enabled: true },
    ]
    const { cells } = cellsOf(traces.watchesFn, { granularity: 'every-line', display: 'exam' }, watches)
    expect(cells.some((c) => c.colId === 'watch:cur')).toBe(true)
    expect(cells.some((c) => c.colId === 'watch:bad')).toBe(false) // ⚠ cell has no value to predict
  })

  it('rows without writes give nothing', () => {
    expect(cellsOf(traces.zeroDivision).cells.length).toBe(1) // only `a = 1`; the crashing row writes nothing
  })
})

describe('selectMasks', () => {
  const { cells } = cellsOf(traces.digitSum)
  const keys = (s: Set<string>) => [...s].sort()

  it('all: every question', () => {
    expect(selectMasks(cells, cfg({ maskMode: 'all' }), 1).size).toBe(15)
  })

  it('columns: only the chosen ones; none chosen ⇒ nothing masked', () => {
    const m = selectMasks(cells, cfg({ maskMode: 'columns', columns: ['<module>:total', 'output'] }), 1)
    expect(m.size).toBe(6)
    expect([...m].every((k) => k.endsWith(':<module>:total') || k.endsWith(':output'))).toBe(true)
    expect(selectMasks(cells, cfg({ maskMode: 'columns', columns: [] }), 1).size).toBe(0)
    expect(selectMasks(cells, cfg({ maskMode: 'columns', columns: ['nope'] }), 1).size).toBe(0)
  })

  it('outputOnly overrides the mode', () => {
    for (const maskMode of ['all', 'random', 'columns'] as const) {
      const m = selectMasks(cells, cfg({ maskMode, outputOnly: true, columns: ['<module>:n'] }), 1)
      expect([...m]).toEqual([expect.stringMatching(/:output$/)])
    }
  })

  it('random: an EXACT percentage (not a coin flip per cell)', () => {
    for (const [percent, want] of [[0, 0], [10, 2], [50, 8], [60, 9], [100, 15]] as const) {
      for (const seed of [1, 2, 3, 99]) expect(selectMasks(cells, cfg({ maskMode: 'random', percent }), seed).size).toBe(want)
    }
  })

  it('random: asking for a little masks at least one cell; asking for 0 masks none; out-of-range is clamped', () => {
    expect(selectMasks(cells, cfg({ maskMode: 'random', percent: 1 }), 5).size).toBe(1)
    expect(selectMasks(cells, cfg({ maskMode: 'random', percent: 0 }), 5).size).toBe(0)
    expect(selectMasks(cells, cfg({ maskMode: 'random', percent: 250 }), 5).size).toBe(15)
    expect(selectMasks(cells, cfg({ maskMode: 'random', percent: -5 }), 5).size).toBe(0)
    expect(selectMasks([], cfg({ maskMode: 'random', percent: 50 }), 5).size).toBe(0)
  })

  it('random: the same seed always picks the same cells; other seeds pick other cells', () => {
    const c = cfg({ maskMode: 'random', percent: 40 })
    expect(keys(selectMasks(cells, c, 123))).toEqual(keys(selectMasks(cells, c, 123)))
    const distinct = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => keys(selectMasks(cells, c, s)).join('|')))
    expect(distinct.size).toBeGreaterThan(4)
  })

  it('random: every question has a fair chance of being picked', () => {
    const c = cfg({ maskMode: 'random', percent: 50 })
    const hits = new Map<string, number>()
    for (let seed = 1; seed <= 400; seed++) for (const k of selectMasks(cells, c, seed)) hits.set(k, (hits.get(k) ?? 0) + 1)
    expect(hits.size).toBe(15) // none is unreachable
    for (const n of hits.values()) {
      expect(n).toBeGreaterThan(120) // expected ~200 of 400
      expect(n).toBeLessThan(280)
    }
  })
})

describe('hintFor: gives the shape, not the answer', () => {
  const v = (value: Value): Truth => ({ kind: 'value', value })
  const I = (n: number): Value => ({ k: 'int', v: String(n) })
  const S = (s: string): Value => ({ k: 'str', v: s })
  it.each<[string, Truth, string]>([
    ['int', v(I(5)), 'a whole number (an int)'],
    ['float', v({ k: 'float', v: '2.5' }), 'a decimal number (a float)'],
    ['bool', v({ k: 'bool', v: true }), 'True or False'],
    ['none', v({ k: 'none' }), 'None'],
    ['string', v(S('hello')), 'a string of 5 characters'],
    ['one-char string', v(S('x')), 'a string of 1 character'],
    ['empty string', v(S('')), 'an empty string'],
    ['list of ints', v({ k: 'list', items: [I(1), I(2), I(3), I(4)], ref: 1 }), 'a list of 4 ints'],
    ['list of one int', v({ k: 'list', items: [I(1)], ref: 1 }), 'a list of 1 int'],
    ['list of strings', v({ k: 'list', items: [S('a'), S('b')], ref: 1 }), 'a list of 2 strings'],
    ['mixed list', v({ k: 'list', items: [I(1), S('a'), { k: 'none' }], ref: 1 }), 'a list of 3 items'],
    ['nested lists', v({ k: 'list', items: [{ k: 'list', items: [], ref: 2 }, { k: 'list', items: [], ref: 3 }], ref: 1 }), 'a list of 2 lists'],
    ['empty list', v({ k: 'list', items: [], ref: 1 }), 'an empty list'],
    ['tuple', v({ k: 'tuple', items: [I(1), I(2)], ref: 1 }), 'a tuple of 2 ints'],
    ['set', v({ k: 'set', items: [I(1)], ref: 1 }), 'a set of 1 int'],
    ['empty set', v({ k: 'set', items: [], ref: 1 }), 'an empty set'],
    ['dict', v({ k: 'dict', entries: [[S('a'), I(1)], [S('b'), I(2)]], ref: 1 }), 'a dict with 2 keys'],
    ['dict one key', v({ k: 'dict', entries: [[S('a'), I(1)]], ref: 1 }), 'a dict with 1 key'],
    ['empty dict', v({ k: 'dict', entries: [], ref: 1 }), 'an empty dict'],
    ['object', v({ k: 'object', type: 'Point', fields: {}, ref: 1 }), 'a Point object'],
    ['one-line output', { kind: 'output', text: 'Vowels: 5' }, 'text, 9 characters'],
    ['one-char output', { kind: 'output', text: '7' }, 'text, 1 character'],
    ['multi-line output', { kind: 'output', text: 'ab\ncd' }, '2 lines of text, 4 characters in all'],
  ])('%s', (_name, truth, want) => expect(hintFor(truth)).toBe(want))

  it('never contains the value itself', () => {
    expect(hintFor(v(S('secret')))).not.toMatch(/secret/)
    expect(hintFor(v(I(31337)))).not.toMatch(/31337/)
    expect(hintFor({ kind: 'output', text: 'Password: hunter2' })).not.toMatch(/hunter2/)
  })
})

describe('summarise / formatPoints', () => {
  const masked = [
    { key: '0:a', colId: 'a' },
    { key: '1:a', colId: 'a' },
    { key: '2:b', colId: 'b' },
    { key: '3:b', colId: 'b' },
    { key: '4:b', colId: 'b' },
  ]
  const g = (state: Grade['state']): Grade => ({ state })
  const header = (id: string) => id.toUpperCase()

  it('tallies, awards half marks for close, and breaks down by column', () => {
    const s = summarise(masked, { '0:a': g('correct'), '1:a': g('close'), '2:b': g('incorrect'), '3:b': g('correct'), '4:b': g('correct') }, {}, 0.5, header)
    expect(s).toMatchObject({ total: 5, correct: 3, close: 1, incorrect: 1, revealed: 0, pending: 0, points: 3.5, percent: 70 })
    expect(s.byColumn).toEqual([
      { colId: 'a', header: 'A', correct: 1, close: 1, incorrect: 0, total: 2 },
      { colId: 'b', header: 'B', correct: 2, close: 0, incorrect: 1, total: 3 },
    ])
  })

  it('close can be worth nothing', () => {
    const s = summarise(masked, { '0:a': g('close'), '1:a': g('close') }, {}, 0, header)
    expect(s.points).toBe(0)
  })

  it('revealed cells are excluded from the score entirely', () => {
    const s = summarise(masked, { '0:a': g('correct'), '1:a': g('correct'), '3:b': g('correct') }, { '2:b': true, '4:b': true }, 0.5, header)
    expect(s).toMatchObject({ total: 3, correct: 3, revealed: 2, points: 3, percent: 100 })
    expect(s.byColumn.find((c) => c.colId === 'b')).toMatchObject({ total: 1 })
  })

  it('cells edited after the check are pending, and cost marks until re-checked', () => {
    const s = summarise(masked, { '0:a': g('correct') }, {}, 0.5, header)
    expect(s).toMatchObject({ total: 5, correct: 1, pending: 4, points: 1, percent: 20 })
  })

  it('an empty session scores 0%, not NaN', () => {
    expect(summarise([], {}, {}, 0.5, header)).toMatchObject({ total: 0, percent: 0, points: 0 })
  })

  it('rounds the percentage', () => {
    const three = masked.slice(0, 3)
    expect(summarise(three, { '0:a': g('correct'), '1:a': g('incorrect'), '2:b': g('incorrect') }, {}, 0.5, header).percent).toBe(33)
  })

  it('formats points as `17 / 20` or `17.5 / 20`', () => {
    expect(formatPoints(17, 20)).toBe('17 / 20')
    expect(formatPoints(17.5, 20)).toBe('17.5 / 20')
    expect(formatPoints(0, 0)).toBe('0 / 0')
  })
})
