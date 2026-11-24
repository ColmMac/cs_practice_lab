import { describe, expect, it } from 'vitest'
import { buildFrames, frameValues, parseList, parseTarget, runAlgorithm, type AlgorithmId } from '../../src/core/algorithms'

const sorts: AlgorithmId[] = ['bubble', 'insertion', 'merge']

describe('buildFrames', () => {
  it.each(sorts)('%s: one frame per step, ending sorted with every card in its own slot', (algo) => {
    for (const data of [[5, 1, 4, 2, 8], [4, 2, 4, 1, 2], [9, 7, 5, 3, 1], [1, 2]]) {
      const run = runAlgorithm(algo, data)
      const frames = buildFrames(run)
      expect(frames).toHaveLength(run.steps.length + 1)
      const end = frames[frames.length - 1]!
      expect(frameValues(end)).toEqual(run.final)
      expect(end.cards.map((c) => c.pos).sort()).toEqual(data.map((_, i) => i))
      expect(end.marks.every((m) => m === 'sorted')).toBe(true)
      expect(end.comparisons).toBe(run.comparisons)
    }
  })

  it('bubble [5,1,4,2,8]: first compare then swap, with captions and counters', () => {
    const frames = buildFrames(runAlgorithm('bubble', [5, 1, 4, 2, 8]))
    expect(frames[0]!.caption).toMatch(/^Ready/)
    expect(frames[1]!.caption).toBe('Compare 5 and 1: 5 is bigger, so swap them.')
    expect(frames[1]!.marks.slice(0, 2)).toEqual(['compare', 'compare'])
    expect(frameValues(frames[2]!)).toEqual([1, 5, 4, 2, 8])
    expect(frames[2]!.marks.slice(0, 2)).toEqual(['swap', 'swap'])
    expect(frames[2]!.swaps).toBe(1)
  })

  it('bubble marks the tail sorted after each pass', () => {
    const run = runAlgorithm('bubble', [5, 1, 4, 2, 8])
    const frames = buildFrames(run)
    const firstPassEnd = frames.find((f) => f.pass === 1)!
    expect(firstPassEnd.marks[firstPassEnd.cards.find((c) => c.value === 8)!.id]).toBe('sorted')
    expect(firstPassEnd.marks.filter((m) => m === 'sorted')).toHaveLength(1)
  })

  it('insertion lifts the key while others shift, then places it', () => {
    const run = runAlgorithm('insertion', [5, 1, 4])
    const frames = buildFrames(run)
    const withKey = frames.find((f) => f.cards.some((c) => c.lifted))!
    expect(withKey.cards.find((c) => c.lifted)!.value).toBe(1)
    expect(frameValues(withKey)).toEqual([5, 4])
    const placed = frames.find((f) => f.marks.includes('placed'))!
    expect(placed.cards.some((c) => c.lifted)).toBe(false)
  })

  it('merge sort keeps duplicate cards distinct and stable', () => {
    const run = runAlgorithm('merge', [3, 3, 1])
    const end = buildFrames(run).at(-1)!
    const order = [...end.cards].sort((a, b) => a.pos - b.pos).map((c) => c.id)
    expect(order).toEqual([2, 0, 1]) // the first 3 (id 0) stays before the second (id 1)
  })

  it('binary search discards outside the live range and marks the middle', () => {
    const run = runAlgorithm('binary', [3, 9, 10, 23, 27, 38, 43, 82], { target: 23 })
    const frames = buildFrames(run)
    const first = frames[1]!
    expect(first.marks[3]).toBe('mid')
    expect(first.caption).toContain('middle is index 3')
    expect(first.caption).toContain('equals the target 23')
    expect(frames.at(-1)!.marks[3]).toBe('found')
    const miss = buildFrames(runAlgorithm('binary', [1, 3, 5, 7], { target: 4 }))
    expect(miss.at(-1)!.marks.every((m) => m === 'discarded')).toBe(true)
    expect(miss.at(-1)!.caption).toBe('Not found: 4 is not in the list.')
  })

  it('linear search rules out earlier items', () => {
    const frames = buildFrames(runAlgorithm('linear', [5, 1, 4], { target: 4 }))
    expect(frames[3]!.marks).toEqual(['discarded', 'discarded', 'compare'])
    expect(frames.at(-1)!.marks[2]).toBe('found')
  })
})

describe('list and target input', () => {
  it('accepts commas, spaces and negatives', () => {
    expect(parseList('5, 1  4;-2')).toEqual({ ok: true, value: [5, 1, 4, -2] })
  })
  it.each([
    ['5', /at least 2/],
    ['1,2,3,4,5,6,7,8,9,10,11,12,13', /at most 12/],
    ['1, x', /not a whole number/],
    ['1, 2.5', /not a whole number/],
    ['1, 1000', /outside/],
    ['-100, 1', /outside/],
  ])('rejects %s', (text, msg) => {
    const r = parseList(text)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(msg)
  })
  it('validates the target', () => {
    expect(parseTarget(' 23 ')).toEqual({ ok: true, value: 23 })
    expect(parseTarget('').ok).toBe(false)
    expect(parseTarget('abc').ok).toBe(false)
    expect(parseTarget('5000').ok).toBe(false)
  })
})
