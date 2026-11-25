/** No practice question may be trivial: these hold for every generator, over many seeds, and for every preset. */
import { describe, expect, it } from 'vitest'
import {
  binarySearch,
  bubbleSort,
  buildQuiz,
  countInversions,
  insertionSort,
  LIST_PRESETS,
  linearSearch,
  mergeSort,
  MIN_INVERSIONS,
  parseList,
  quizUnavailable,
  randomSearchInput,
  randomSortingList,
  sortedProblem,
} from '../../src/core/algorithms'
import { applyColumnPrefs, deriveColumns } from '../../src/core/derive/columns'
import { evaluate, logicPresets, parseProgram } from '../../src/core/logic'
import { add, generateQuestions, toBinary, toSigned, toUnsigned, type Bits } from '../../src/core/numbers'
import { constantStarts } from '../../src/core/study/mask'
import { buildStudyModel } from '../../src/core/study/model'
import { mulberry32 } from '../../src/core/study/rng'
import { DEFAULT_STUDY_CONFIG, type StudyConfig } from '../../src/core/study/types'
import { DEFAULT_TRACE_OPTIONS, type TraceResult } from '../../src/core/types'
import { DEFAULT_HIDDEN_COLUMNS } from '../../src/core/workspace'
import { formatPythonValue } from '../../src/languages/python/format'
import { materialise } from '../../src/languages/python/materialise'
import { pythonPresets } from '../../src/languages/python/presets'

const SEEDS = Array.from({ length: 500 }, (_, i) => i + 1)
const inOrder = (a: readonly number[]) => sortedProblem(a) === null

describe('random sorting lists', () => {
  const lists = SEEDS.map((seed) => randomSortingList(mulberry32(seed)))

  it('are never already sorted, never all one value, and have at least three inversions', () => {
    for (const list of lists) {
      expect(inOrder(list), String(list)).toBe(false)
      expect(new Set(list).size, String(list)).toBe(list.length)
      expect(countInversions(list), String(list)).toBeGreaterThanOrEqual(MIN_INVERSIONS)
      expect(parseList(list.join(', '))).toEqual({ ok: true, value: list })
    }
  })

  it('give every algorithm several operations to trace, and a quiz', () => {
    for (const list of lists) {
      expect(bubbleSort(list).swaps).toBeGreaterThanOrEqual(MIN_INVERSIONS)
      expect(insertionSort(list).shifts).toBeGreaterThanOrEqual(MIN_INVERSIONS)
      const merge = mergeSort(list)
      expect(merge.steps.filter((s) => s.kind === 'merge').length).toBeGreaterThan(1)
      for (const run of [bubbleSort(list), insertionSort(list), merge]) {
        expect(quizUnavailable(run)).toBeNull()
        const qs = buildQuiz(run)
        expect(qs.length).toBeGreaterThan(1)
        expect(qs.some((q) => q.truth !== `[${q.from!.join(', ')}]`)).toBe(true)
      }
    }
  })

  it('vary with the seed', () => {
    expect(new Set(lists.map(String)).size).toBeGreaterThan(450)
  })

  it('still meet the rule when the random source is stuck', () => {
    let n = 0
    // distinct values, then a shuffle that never moves anything out of its ascending order
    const stuck = () => (n < 6 ? n++ / 100 : 0.999999)
    expect(countInversions(randomSortingList(stuck))).toBeGreaterThanOrEqual(MIN_INVERSIONS)
  })

  it('countInversions, by hand: [5,1,4,2,8] has 5>1, 5>4, 5>2, 4>2', () => {
    expect(countInversions([5, 1, 4, 2, 8])).toBe(4)
    expect(countInversions([1, 2, 3])).toBe(0)
    expect(countInversions([7, 7, 7])).toBe(0)
  })
})

describe('random search inputs', () => {
  it('binary: strictly ascending, and the target takes at least two probes and is not first', () => {
    for (const seed of SEEDS) {
      const { data, target } = randomSearchInput('binary', mulberry32(seed))
      expect(data.every((v, i) => i === 0 || data[i - 1]! < v), String(data)).toBe(true)
      const at = data.indexOf(target)
      expect(at).toBeGreaterThan(0)
      expect(at).not.toBe(Math.floor((data.length - 1) / 2))
      expect(binarySearch(data, target).comparisons).toBeGreaterThanOrEqual(2)
    }
  })

  it('linear: the target is there, and takes at least three comparisons', () => {
    for (const seed of SEEDS) {
      const { data, target } = randomSearchInput('linear', mulberry32(seed))
      expect(new Set(data).size).toBe(data.length)
      const run = linearSearch(data, target)
      expect(run.foundAt).toBeGreaterThanOrEqual(2)
      expect(run.comparisons).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('sorting examples and quiz', () => {
  it('only a list labelled as sorted is already in order', () => {
    for (const p of LIST_PRESETS) if (inOrder(p.data)) expect(p.label).toMatch(/sorted/i)
  })

  it('the sorted search example takes more than one probe', () => {
    const p = LIST_PRESETS.find((x) => x.id === 'search')!
    expect(binarySearch(p.data, p.target!).comparisons).toBeGreaterThan(1)
  })

  it.each([[[1, 2, 3, 4, 5]], [[4, 4, 4, 4]], [[2, 2, 3, 9]]])('there is no sorting quiz on %j', (list) => {
    for (const run of [bubbleSort(list), insertionSort(list), mergeSort(list)]) {
      expect(quizUnavailable(run)).toMatch(/already in order/)
    }
    // searching a sorted list is still a fair question
    expect(quizUnavailable(binarySearch(list, list.at(-1)!))).toBeNull()
  })
})

describe('number practice questions', () => {
  const questions = SEEDS.flatMap((seed) => generateQuestions(seed, 16))
  const ones = (bits: Bits) => bits.filter((b) => b === 1).length

  it('never ask about 0, 1, all zeros, all ones or a single place value', () => {
    for (const q of questions) {
      for (const bits of [q.bits, q.other]) {
        if (!bits) continue
        expect(toUnsigned(bits), q.prompt).toBeGreaterThan(1)
        expect(ones(bits), q.prompt).toBeLessThan(8)
      }
      if (q.answerType !== 'yesno') expect(['0', '1', '00000000', '00000001'], q.prompt).not.toContain(q.truth)
      if (['dec2bin', 'bin2dec', 'bin2hex', 'hex2bin', 'twos2dec'].includes(q.kind)) {
        expect(ones(q.bits), q.prompt).toBeGreaterThanOrEqual(2)
        expect(ones(q.bits), q.prompt).toBeLessThanOrEqual(6)
      }
    }
  })

  it('two’s complement questions are about negative numbers other than -1 and -2', () => {
    for (const q of questions) {
      if (q.kind === 'neg2twos' || q.kind === 'twos2dec') expect(toSigned(q.bits), q.prompt).toBeLessThan(-2)
    }
  })

  it('additions need at least two carries and do not come out as zero', () => {
    for (const q of questions) {
      if (q.kind !== 'add') continue
      const r = add(q.bits, q.other!)
      expect(r.carries.filter((c) => c === 1).length + r.carryOut, q.prompt).toBeGreaterThanOrEqual(2)
      expect(toBinary(r.bits)).not.toBe('00000000')
    }
  })

  it('overflow questions cross a boundary or involve a negative number', () => {
    const seen = new Set<string>()
    for (const q of questions) {
      if (q.kind !== 'overflow') continue
      const [a, b] = [toSigned(q.bits), toSigned(q.other!)]
      expect(Math.min(Math.abs(a), Math.abs(b)), q.prompt).toBeGreaterThanOrEqual(3)
      const crosses = a + b < -128 || a + b > 127
      expect(crosses || a < 0 || b < 0, q.prompt).toBe(true)
      expect(q.truth).toBe(crosses ? 'yes' : 'no')
      seen.add(`${q.truth}:${a < 0 || b < 0}`)
    }
    // both answers come up, and "yes" in both directions
    expect([...seen].sort()).toEqual(['no:true', 'yes:false', 'yes:true'])
  })
})

describe('truth table presets (there is no random expression generator)', () => {
  it.each(logicPresets.map((p) => [p.id, p.source]))('%s: every input matters and no output is constant', (_id, source) => {
    const program = parseProgram(source)
    const n = program.variables.length
    const rows = Array.from({ length: 1 << n }, (_, i) =>
      Object.fromEntries(program.variables.map((v, k) => [v, Boolean((i >> (n - 1 - k)) & 1)])),
    )
    for (const o of program.outputs) expect(new Set(rows.map((r) => evaluate(o.expr, r))).size, o.name).toBe(2)
    for (const v of program.variables) {
      const matters = program.outputs.some((o) => rows.some((r) => evaluate(o.expr, r) !== evaluate(o.expr, { ...r, [v]: !r[v] })))
      expect(matters, v).toBe(true)
    }
  })
})

const wires = import.meta.glob('../fixtures/wire/*.json', { eager: true, import: 'default' }) as Record<
  string,
  { code: string; wire: Parameters<typeof materialise>[0] }
>
const wire = (name: string): TraceResult => {
  const f = wires[`../fixtures/wire/${name}.json`]!
  return materialise(f.wire, { runId: name, code: f.code, options: DEFAULT_TRACE_OPTIONS })
}

const study = (r: TraceResult, config: StudyConfig = DEFAULT_STUDY_CONFIG) => {
  const columns = applyColumnPrefs(deriveColumns(r), { hidden: DEFAULT_HIDDEN_COLUMNS, order: [] })
  return buildStudyModel(r, { columns, granularity: 'compact', display: 'exam', config, seed: 1 }, formatPythonValue)
}

describe.each(pythonPresets.map((p) => p.id))('trace preset %s', (id) => {
  const r = wire(`preset-${id}`)

  it('repeats (a loop or recursion) and changes a variable', () => {
    const entered = r.steps.filter((s) => s.branch === true && ['for', 'while'].includes(r.lines![s.lineNumber]!.kind))
    const calls = r.steps.filter((s) => s.kind === 'call')
    expect(Math.max(entered.length, calls.length)).toBeGreaterThanOrEqual(2)
    const model = study(r)
    const writes = new Map<string, number>()
    for (const c of model.cells) writes.set(c.colId, (writes.get(c.colId) ?? 0) + 1)
    expect(Math.max(...writes.values())).toBeGreaterThanOrEqual(2)
  })

  it('Study Mode asks several questions, none of them a constant starting value', () => {
    const starts = constantStarts(r)
    for (const config of [DEFAULT_STUDY_CONFIG, { ...DEFAULT_STUDY_CONFIG, maskMode: 'random' as const, percent: 100 }]) {
      const { masked } = study(r, config)
      expect(masked.length).toBeGreaterThanOrEqual(4)
      expect(masked.filter((c) => starts.has(c.key))).toEqual([])
    }
  })
})

describe('constant starting values', () => {
  const r = wire('preset-linear-search')
  const model = study(r)
  const describeCell = (key: string) => {
    const [step, ...col] = key.split(':')
    return `${r.steps[Number(step)]!.lineNumber} ${col.join(':')}`
  }

  it('by hand for linear search: items, target, found and i start as constants; found = True later is a real change', () => {
    expect(model.cells.filter((c) => c.given).map((c) => describeCell(c.key))).toEqual([
      '1 <module>:items',
      '2 <module>:target',
      '3 <module>:found',
      '4 <module>:i',
    ])
    expect(model.masked.map((c) => describeCell(c.key))).toEqual(['9 <module>:i', '9 <module>:i', '7 <module>:found', '10 output'])
  })

  it('a hand-picked starting value is still hidden', () => {
    const first = model.cells[0]!
    expect([...study(r, { ...DEFAULT_STUDY_CONFIG, maskMode: 'cells', cells: [first.key] }).maskedKeys]).toEqual([first.key])
  })

  it('a chosen column made only of a starting value is still hidden; otherwise the start is left in', () => {
    const columns = (id: string) =>
      [...study(r, { ...DEFAULT_STUDY_CONFIG, maskMode: 'columns', columns: [id] }).maskedKeys].map(describeCell)
    expect(columns('<module>:target')).toEqual(['2 <module>:target'])
    expect(columns('<module>:i')).toEqual(['9 <module>:i', '9 <module>:i'])
  })

  it('when a table has nothing but starting values, they are asked', () => {
    const only = study(wire('zero-division'))
    expect(only.cells.map((c) => c.given)).toEqual([true])
    expect(only.masked).toHaveLength(1)
  })
})
