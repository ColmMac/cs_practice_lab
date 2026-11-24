import { describe, expect, it } from 'vitest'
import { binarySearch, bubbleSort, buildFrames, buildQuiz, gradeQuiz, insertionSort, linearSearch, mergeSort, parseAnswerList, quizUnavailable } from '../../src/core/algorithms'

const TEXTBOOK = [5, 1, 4, 2, 8]
const SEARCH = [3, 9, 10, 23, 27, 38, 43, 82]
const truths = (qs: ReturnType<typeof buildQuiz>) => qs.map((q) => q.truth)

// Worked by hand: bubble [5,1,4,2,8] -> [1,4,2,5,8] -> [1,2,4,5,8] -> no swaps. Insertion: one key per pass.
describe('buildQuiz: sorting', () => {
  it('bubble sort asks for the list after each pass', () => {
    const qs = buildQuiz(bubbleSort(TEXTBOOK))
    expect(truths(qs)).toEqual(['[1, 4, 2, 5, 8]', '[1, 2, 4, 5, 8]', '[1, 2, 4, 5, 8]'])
    expect(qs[0]!.prompt).toBe('Start from [5, 1, 4, 2, 8]. What is the whole list after pass 1?')
    expect(qs[1]!.prompt).toContain('Start from [1, 4, 2, 5, 8]')
  })

  it('insertion sort asks one question per key', () => {
    expect(truths(buildQuiz(insertionSort(TEXTBOOK)))).toEqual([
      '[1, 5, 4, 2, 8]',
      '[1, 4, 5, 2, 8]',
      '[1, 2, 4, 5, 8]',
      '[1, 2, 4, 5, 8]',
    ])
  })

  it('merge sort asks per level and ends sorted', () => {
    const run = mergeSort(TEXTBOOK)
    const qs = buildQuiz(run)
    expect(qs.length).toBe(run.steps.filter((s) => s.kind === 'pass-end').length)
    expect(qs.at(-1)!.truth).toBe('[1, 2, 4, 5, 8]')
    expect(qs[0]!.prompt).toContain('level 1')
  })

  it('every question starts at a real frame, and the first pass starts at the very beginning', () => {
    for (const run of [bubbleSort(TEXTBOOK), insertionSort(TEXTBOOK), mergeSort(TEXTBOOK)]) {
      const frames = buildFrames(run)
      const qs = buildQuiz(run)
      for (const q of qs) expect(q.before).toBeLessThan(frames.length)
      expect(qs.map((q) => q.before)).toEqual([...qs.map((q) => q.before)].sort((a, b) => a - b))
    }
    expect(buildQuiz(bubbleSort(TEXTBOOK))[0]!.before).toBe(0)
    // Merge sort: the first level begins after every split.
    const merge = mergeSort(TEXTBOOK)
    const firstWork = merge.steps.findIndex((s) => s.kind !== 'split')
    expect(firstWork).toBe(4) // [5,1,4,2,8] has four splits
    expect(buildQuiz(merge)[0]!.before).toBe(firstWork)
  })
})

// Worked by hand on [3,9,10,23,27,38,43,82], target 23: mid 3 (23: found).  Target 43: mid 3 (23<43, low 4), mid 5 (38<43, low 6), mid 6 (43).
describe('buildQuiz: binary search', () => {
  it('asks for each mid', () => {
    const qs = buildQuiz(binarySearch(SEARCH, 43))
    expect(truths(qs)).toEqual(['3', '5', '6'])
    expect(qs[0]!.prompt).toContain('indices 0 to 7')
    expect(qs[1]!.prompt).toContain('The last probe was index 3, which held 23; that is less than 43.')
    expect(qs[0]!.before).toBe(0)
  })

  it('a search for a smaller target: 3 -> mid 3 (23 > 3), mid 1 (9 > 3), mid 0', () => {
    const qs = buildQuiz(binarySearch(SEARCH, 3))
    expect(truths(qs)).toEqual(['3', '1', '0'])
    expect(qs[1]!.prompt).toContain('bigger than 3')
  })

  it('linear search has nothing to predict', () => {
    const run = linearSearch(SEARCH, 10)
    expect(buildQuiz(run)).toEqual([])
    expect(quizUnavailable(run)).toMatch(/nothing to predict/)
    expect(quizUnavailable(null)).toMatch(/Fix the input/)
    expect(quizUnavailable(bubbleSort(TEXTBOOK))).toBeNull()
  })
})

describe('gradeQuiz', () => {
  const [p1] = buildQuiz(bubbleSort(TEXTBOOK))
  const [, second] = buildQuiz(binarySearch(SEARCH, 43)) // truth 5, range 4..7

  it('accepts a list written several ways', () => {
    for (const a of ['1,4,2,5,8', '[1, 4, 2, 5, 8]', '1 4 2 5 8', '1;4;2;5;8'])
      expect(gradeQuiz(p1!, a).state).toBe('correct')
  })

  it('tells right numbers in the wrong order from wrong numbers, without giving the answer', () => {
    expect(gradeQuiz(p1!, '1,2,4,5,8')).toEqual({ state: 'close', message: 'Right numbers, but not in the order they would be in.' })
    expect(gradeQuiz(p1!, '5,1,4,2,8').message).toMatch(/before this step/)
    expect(gradeQuiz(p1!, '1,4,2,5').message).toMatch(/5 items/)
    expect(gradeQuiz(p1!, '9,9,9,9,9').state).toBe('incorrect')
    expect(gradeQuiz(p1!, 'one,two').state).toBe('incorrect')
    expect(gradeQuiz(p1!, '').message).toBe('No answer yet.')
  })

  it('grades an index, with the round-up slip as almost and ruled-out indices called out', () => {
    expect(gradeQuiz(second!, '5').state).toBe('correct')
    expect(gradeQuiz(second!, ' 5 ').state).toBe('correct')
    // low 4, high 7: floor(11/2) = 5, ceil = 6
    expect(gradeQuiz(second!, '6')).toEqual({ state: 'close', message: 'Round the middle down, not up.' })
    expect(gradeQuiz(second!, '2').message).toMatch(/ruled out/)
    expect(gradeQuiz(second!, '7').state).toBe('incorrect')
    expect(gradeQuiz(second!, 'x').message).toMatch(/whole number/)
  })

  it('no message ever contains the answer', () => {
    for (const run of [bubbleSort(TEXTBOOK), insertionSort(TEXTBOOK), mergeSort(TEXTBOOK), binarySearch(SEARCH, 43)])
      for (const q of buildQuiz(run))
        for (const guess of ['', 'x', '1', '2', '6', '1,2,3', '8,2,4,1,5', '1,2,4,5,8', '5,1,4,2,8'])
          expect(gradeQuiz(q, guess).message ?? '').not.toContain(q.truth)
  })

  it('parseAnswerList', () => {
    expect(parseAnswerList('[ -1, 2 ]')).toEqual([-1, 2])
    expect(parseAnswerList('1, a')).toBeNull()
    expect(parseAnswerList('  ')).toBeNull()
  })
})
