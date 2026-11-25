import { describe, expect, it } from 'vitest'
import { explainCell, explanationText, maskedValueGuard, type ExplainContext } from '../../src/core/explain/stepExplainer'
import { applyColumnPrefs, CONDITION_COL, deriveColumns, OUTPUT_COL, RETURN_COL } from '../../src/core/derive/columns'
import { buildStudyModel } from '../../src/core/study/model'
import { DEFAULT_STUDY_CONFIG } from '../../src/core/study/types'
import { DEFAULT_TRACE_OPTIONS, type TraceResult, type TraceStep, type WatchExpression } from '../../src/core/types'
import { DEFAULT_HIDDEN_COLUMNS } from '../../src/core/workspace'
import { formatPythonValue } from '../../src/languages/python/format'
import { materialise } from '../../src/languages/python/materialise'
import type { WireResult } from '../../src/languages/python/protocol'

const wires = import.meta.glob('../fixtures/wire/*.json', { eager: true, import: 'default' }) as Record<
  string,
  { code: string; wire: WireResult }
>

function traceOf(name: string): TraceResult {
  const f = wires[`../fixtures/wire/${name}.json`]!
  return materialise(f.wire, { runId: name, code: f.code, options: DEFAULT_TRACE_OPTIONS })
}

const ctxOf = (result: TraceResult, extra: Partial<ExplainContext> = {}): ExplainContext => ({
  result,
  format: formatPythonValue,
  ...extra,
})

/** The n-th step that ran `line` (optionally in a frame at `depth`). */
function stepAt(r: TraceResult, line: number, nth = 0, match: (s: TraceStep) => boolean = () => true): number {
  const found = r.steps.filter((s) => s.lineNumber === line && match(s))[nth]
  if (!found) throw new Error(`no step ${nth} for line ${line}`)
  return found.stepIndex
}

/** `[without the result (Why?), what Reveal adds]` */
function both(ctx: ExplainContext, step: number, col: string): [string, string] {
  const why = explanationText(explainCell(ctx, step, col, { withResult: false }))
  const full = explanationText(explainCell(ctx, step, col, { withResult: true }))
  expect(full.startsWith(why)).toBe(true)
  return [why, full.slice(why.length)]
}

describe('linear search (worked by hand)', () => {
  const r = traceOf('preset-linear-search')
  const ctx = ctxOf(r)

  it('assignment: the value before the line, put into the right-hand side', () => {
    expect(both(ctx, stepAt(r, 9), '<module>:i')).toEqual([
      'Line 9 ran `i = i + 1`. Before it ran, `i` was `0`, so the right-hand side is `0 + 1`.',
      ' So `i` becomes `1`.',
    ])
  })

  it('while: the test with values in, then which way it went', () => {
    expect(both(ctx, stepAt(r, 5, 3), CONDITION_COL)).toEqual([
      'Line 5 tested `i < len(items) and not found`. With `i` = `2` and `found` = `True` that is `2 < len(items) and (not True)`.',
      ' The condition is `False`, `so the loop ends`.',
    ])
    expect(both(ctx, stepAt(r, 5, 0), CONDITION_COL)[1]).toBe(' The condition is `True`, `so the loop body runs`.')
  })

  it('if: a collection stays as its name', () => {
    expect(both(ctx, stepAt(r, 6, 0), CONDITION_COL)).toEqual([
      'Line 6 tested `items[i] == target`. With `i` = `0` and `target` = `15` that is `items[0] == 15`.',
      ' The condition is `False`, `so the body is skipped`.',
    ])
  })

  it('print: what was printed, with the output only after Reveal', () => {
    expect(both(ctx, stepAt(r, 10), OUTPUT_COL)).toEqual(['Line 10 printed `found, i`.', ' The output is `True 2`.'])
  })
})

describe('digit sum (worked by hand)', () => {
  const r = traceOf('preset-digit-sum')
  const ctx = ctxOf(r)

  it('one name, two names, and a loop test', () => {
    expect(both(ctx, stepAt(r, 4), '<module>:digit')).toEqual([
      'Line 4 ran `digit = n % 10`. Before it ran, `n` was `1234`, so the right-hand side is `1234 % 10`.',
      ' So `digit` becomes `4`.',
    ])
    expect(both(ctx, stepAt(r, 5, 1), '<module>:total')).toEqual([
      'Line 5 ran `total = total + digit`. Before it ran, `total` was `4` and `digit` was `3`, so the right-hand side is `4 + 3`.',
      ' So `total` becomes `7`.',
    ])
    expect(both(ctx, stepAt(r, 3, 4), CONDITION_COL)).toEqual([
      'Line 3 tested `n > 0`. With `n` = `0` that is `0 > 0`.',
      ' The condition is `False`, `so the loop ends`.',
    ])
    expect(both(ctx, stepAt(r, 7), OUTPUT_COL)).toEqual(['Line 7 printed `total`.', ' The output is `10`.'])
  })

  it('a literal assignment has nothing to substitute', () => {
    expect(both(ctx, stepAt(r, 2), '<module>:total')).toEqual(['Line 2 ran `total = 0`.', ' So `total` becomes `0`.'])
  })
})

describe('factorial (worked by hand)', () => {
  const r = traceOf('preset-factorial')
  const ctx = ctxOf(r)
  const depth = (d: number) => (s: TraceStep) => s.frame.depth === d

  it('a call step, and the first line of a function using the innermost frame under recursion', () => {
    const call = stepAt(r, 1, 0, (s) => s.kind === 'call' && s.frame.depth === 2)
    expect(both(ctx, call, 'fact:n')).toEqual([
      'Line 1 started a call to `fact`: its parameters take the values passed in.',
      ' So `n` is `3`.',
    ])
    expect(both(ctx, stepAt(r, 2, 0, depth(2)), CONDITION_COL)[0]).toBe(
      'Line 2 tested `n <= 1`. With `n` = `3` that is `3 <= 1`.',
    )
    expect(both(ctx, stepAt(r, 2, 0, depth(2)), CONDITION_COL)[1]).toBe(' The condition is `False`, `so the body is skipped`.')
  })

  it('returns: an impure expression is quoted, never substituted', () => {
    expect(both(ctx, stepAt(r, 3), RETURN_COL)).toEqual(['Line 3 returns `1`.', ' The value returned is `1`.'])
    expect(both(ctx, stepAt(r, 4, 0, depth(2)), RETURN_COL)).toEqual([
      'Line 4 returns `n * fact(n - 1)`.',
      ' The value returned is `6`.',
    ])
  })

  it('an assignment from a call, and printing it', () => {
    expect(both(ctx, stepAt(r, 7), '<module>:result')).toEqual(['Line 7 ran `result = fact(4)`.', ' So `result` becomes `24`.'])
    expect(both(ctx, stepAt(r, 8), OUTPUT_COL)).toEqual(['Line 8 printed `result`.', ' The output is `24`.'])
  })
})

describe('input and for loops (vowel counter)', () => {
  const r = traceOf('preset-vowel-counter')
  const ctx = ctxOf(r)

  it('input() is explained as reading the program inputs', () => {
    expect(both(ctx, stepAt(r, 1), '<module>:word')).toEqual([
      'Line 1 reads the next line of the program inputs.',
      " So `word` becomes `'education'`.",
    ])
  })

  it('for: asks for the next item, and says when there is none', () => {
    expect(both(ctx, stepAt(r, 3), '<module>:ch')).toEqual(['Line 3 asks `word` for its next item.', " So `ch` becomes `'e'`."])
    const last = r.steps.filter((s) => s.lineNumber === 3).at(-1)!.stepIndex
    expect(both(ctx, last, CONDITION_COL)).toEqual([
      'Line 3 asks `word` for its next item.',
      ' The condition is `False`: `there are no items left, so the loop ends`.',
    ])
  })
})

describe('harder cases (tests/tracer/make_wire_fixtures.py: explain)', () => {
  const r = traceOf('explain')
  const ctx = ctxOf(r)
  const line = (source: string) => r.steps.find((s) => s.lineSource === source && s.kind !== 'call')!.stepIndex
  const why = (source: string, col: string) => both(ctx, line(source), col)[0]

  it('augmented assignment', () => {
    expect(both(ctx, line('count += 1'), '<module>:count')).toEqual([
      'Line 9 ran `count += 1`, which means `count + 1`; with `count` = `2` that is `2 + 1`.',
      ' So `count` becomes `3`.',
    ])
  })

  it('a swap is never substituted (the values would BE the answer), and only the asked cell is stated', () => {
    const [text, added] = both(ctx, line('a, b = b, a'), '<module>:a')
    expect(text).toBe(
      'Line 12 ran `a, b = b, a`. The value is only copied from `b, a`: look up what was there before this line ran. Everything is read before any name changes.',
    )
    expect(added).toBe(' So `a` becomes `2`.')
  })

  it('globals read inside a function are looked up in the module', () => {
    expect(why('total = count + extra', 'bump:total')).toBe(
      'Line 6 ran `total = count + extra`. Before it ran, `count` was `3` and `extra` was `2`, so the right-hand side is `3 + 2`.',
    )
  })

  it('negative numbers are bracketed; long strings stay as names', () => {
    expect(why('sq = step ** 2', '<module>:sq')).toBe(
      'Line 14 ran `sq = step ** 2`. Before it ran, `step` was `-3`, so the right-hand side is `(-3) ** 2`.',
    )
    expect(why("tag = title + '!'", '<module>:tag')).toBe("Line 13 ran `tag = title + '!'`.")
  })

  it('a change the line does not name (a method call) falls back to the line', () => {
    expect(why('nums.append(b)', '<module>:nums')).toBe('Line 16 ran `nums.append(b)`.')
  })

  it('watch columns name the watch and the line, and state the value only after Reveal', () => {
    const watches: WatchExpression[] = [{ id: 'cond', expr: 'i < n', scope: { kind: 'current' }, enabled: true }]
    const w = traceOf('watches-loop')
    const wctx = ctxOf(w, { watchText: () => watches[0]!.expr })
    expect(both(wctx, stepAt(w, 4), 'watch:cond')).toEqual([
      'This column watches `i < n`, checked after line 4 ran `i += 1`.',
      ' So the watch shows `True`.',
    ])
  })

  it('without line info (the fake runner, old fixtures) it quotes the line', () => {
    const bare = ctxOf({ ...r, lines: undefined })
    expect(both(bare, line('count += 1'), '<module>:count')).toEqual(['Line 9 ran `count += 1`.', ' So `count` becomes `3`.'])
  })
})

const presetNames = Object.keys(wires)
  .map((p) => p.slice(p.lastIndexOf('/') + 1, -'.json'.length))
  .filter((n) => n.startsWith('preset-'))

function studyOf(r: TraceResult, config = DEFAULT_STUDY_CONFIG) {
  const columns = applyColumnPrefs(deriveColumns(r, { showCondition: true }), { hidden: DEFAULT_HIDDEN_COLUMNS, order: [] })
  return buildStudyModel(
    r,
    { columns, granularity: 'compact', display: 'exam', config, seed: 1 },
    formatPythonValue,
  )
}

describe.each(presetNames)('every maskable cell of %s', (name) => {
  const r = traceOf(name)
  const model = studyOf(r)
  const guarded = ctxOf(r, { isHidden: maskedValueGuard(r, model.maskedKeys, () => false) })

  it('Why? never has a result part; Reveal always does', () => {
    expect(model.cells.length).toBeGreaterThan(0)
    for (const cell of model.cells) {
      const step = Number(cell.key.slice(0, cell.key.indexOf(':')))
      for (const ctx of [ctxOf(r), guarded]) {
        const why = explainCell(ctx, step, cell.colId, { withResult: false })
        expect(why.parts.length, cell.key).toBeGreaterThan(0)
        expect(why.parts.filter((p) => p.t === 'result'), cell.key).toEqual([])
        const full = explainCell(ctx, step, cell.colId, { withResult: true })
        expect(full.parts.some((p) => p.t === 'result'), cell.key).toBe(true)
      }
    }
  })
})

describe('values from unanswered cells', () => {
  const r = traceOf('preset-linear-search')
  // hide both writes of `i` involved: the starting `i = 0` (filled in by default) and the first increment
  const cells = [`${stepAt(r, 4)}:<module>:i`, `${stepAt(r, 9)}:<module>:i`]
  const model = studyOf(r, { ...DEFAULT_STUDY_CONFIG, maskMode: 'cells', cells })
  const firstIncrement = stepAt(r, 9)
  const text = (known: (key: string) => boolean) =>
    explanationText(
      explainCell(ctxOf(r, { isHidden: maskedValueGuard(r, model.maskedKeys, known) }), firstIncrement, '<module>:i', {
        withResult: false,
      }),
    )

  it('stay as names until the cell they come from is answered or revealed', () => {
    expect(text(() => false)).toBe('Line 9 ran `i = i + 1`. Values you haven’t worked out yet stay as names.')
    const lineFourI = `${stepAt(r, 4)}:<module>:i`
    expect(model.maskedKeys.has(lineFourI)).toBe(true)
    expect(text((k) => k === lineFourI)).toBe(
      'Line 9 ran `i = i + 1`. Before it ran, `i` was `0`, so the right-hand side is `0 + 1`.',
    )
  })

  it('under recursion follow the exact frame, not another level of the same function', () => {
    const f = traceOf('preset-factorial')
    const call = (d: number) => f.steps.find((s) => s.kind === 'call' && s.frame.depth === d)!
    const isHidden = maskedValueGuard(f, new Set([`${call(4).stepIndex}:fact:n`]), () => false)
    // the first return after the innermost one: depth 4's own closing step still lists its frame
    const outer = f.steps.find((s) => s.lineNumber === 4 && s.frame.depth === 3)!
    expect(isHidden('fact:n', outer.stepIndex, call(3).frame.id)).toBe(false)
    expect(isHidden('fact:n', outer.stepIndex, call(4).frame.id)).toBe(true)
  })
})
