import { describe, expect, it } from 'vitest'
import { applyColumnPrefs, deriveColumns } from '../../src/core/derive/columns'
import { deriveRows } from '../../src/core/derive/rows'
import { DEFAULT_TRACE_OPTIONS, type TraceResult } from '../../src/core/types'
import { DEFAULT_HIDDEN_COLUMNS } from '../../src/core/workspace'
import { formatPythonValue } from '../../src/languages/python/format'
import { materialise } from '../../src/languages/python/materialise'
import type { WireResult } from '../../src/languages/python/protocol'
import { pythonPresets } from '../../src/languages/python/presets'
import { tableText } from './tableText'

const wires = import.meta.glob('../fixtures/wire/preset-*.json', { eager: true, import: 'default' }) as Record<
  string,
  { code: string; options: { stdin?: string[] }; wire: WireResult }
>

function traceOf(id: string): { result: TraceResult; fixtureCode: string } {
  const f = wires[`../fixtures/wire/preset-${id}.json`]
  if (!f) throw new Error(`No wire fixture for preset ${id}; run: npm run fixtures`)
  const result = materialise(f.wire, {
    runId: id,
    code: f.code,
    options: { ...DEFAULT_TRACE_OPTIONS, stdin: f.options.stdin ?? [] },
  })
  return { result, fixtureCode: f.code }
}

// The table as the app shows it by default (the call-stack column is opt-in).
const defaultColumns = (r: TraceResult) =>
  applyColumnPrefs(deriveColumns(r), { hidden: DEFAULT_HIDDEN_COLUMNS, order: [] })

const compact = (r: TraceResult) => {
  const cols = defaultColumns(r)
  return tableText(cols, deriveRows(r, cols, formatPythonValue))
}
const everyLine = (r: TraceResult) => {
  const cols = defaultColumns(r)
  return tableText(cols, deriveRows(r, cols, formatPythonValue, { granularity: 'every-line', display: 'carry' }))
}

describe('presets', () => {
  it('ships the six exam presets', () => {
    expect(pythonPresets.map((p) => p.id)).toEqual([
      'linear-search',
      'bubble-sort',
      'digit-sum',
      'matrix-totals',
      'factorial',
      'vowel-counter',
    ])
  })

  describe.each(pythonPresets.map((p) => [p.id, p] as const))('%s', (id, preset) => {
    it('fixture is fresh (re-run `npm run fixtures` after editing a preset)', () => {
      expect(traceOf(id).fixtureCode).toBe(preset.code)
    })

    it('runs to completion without errors', () => {
      expect(traceOf(id).result.status).toBe('ok')
    })

    it('compact exam table matches the hand-checked golden file', async () => {
      await expect(compact(traceOf(id).result)).toMatchFileSnapshot(`../fixtures/presets/${id}.compact.txt`)
    })

    it('every-line carry-forward table matches the golden file', async () => {
      await expect(everyLine(traceOf(id).result)).toMatchFileSnapshot(`../fixtures/presets/${id}.every-line.txt`)
    })
  })
})

// Independent, hand-derived expectations (not snapshots) for the facts a student would check.
describe('preset ground truth', () => {
  const finalVars = (id: string) => {
    const r = traceOf(id).result
    return Object.fromEntries(
      Object.entries(r.steps.at(-1)!.scopes[0]!.vars).map(([k, v]) => [k, formatPythonValue(v)]),
    )
  }

  it('linear search finds 15 at index 2', () => {
    expect(traceOf('linear-search').result.stdout).toBe('True 2\n')
    expect(finalVars('linear-search')).toMatchObject({ found: 'True', i: '2' })
  })

  it('bubble sort sorts [5, 2, 4, 1]', () => {
    expect(traceOf('bubble-sort').result.stdout).toBe('[1, 2, 4, 5]\n')
  })

  it('digit sum of 1234 is 10', () => {
    expect(traceOf('digit-sum').result.stdout).toBe('10\n')
  })

  it('matrix totals are [6, 15]', () => {
    expect(traceOf('matrix-totals').result.stdout).toBe('[6, 15]\n')
  })

  it('4! is 24 and the recursion goes 4 deep', () => {
    const { result } = traceOf('factorial')
    expect(result.stdout).toBe('24\n')
    expect(Math.max(...result.steps.map((s) => s.callStack.length))).toBe(5) // module + fact(4..1)
    expect(result.steps.filter((s) => s.kind === 'return').map((s) => formatPythonValue(s.returnValue!))).toEqual([
      '1',
      '2',
      '6',
      '24',
    ])
  })

  it('"education" has 5 vowels and echoes the typed input', () => {
    const { result } = traceOf('vowel-counter')
    expect(result.stdout).toBe('Enter a word: education\nVowels: 5\n')
  })
})
