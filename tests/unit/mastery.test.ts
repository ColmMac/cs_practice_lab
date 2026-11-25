import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  emptyMastery,
  isQualifying,
  matchingItemId,
  nextUnfinished,
  presetProgress,
  recordAttempt,
  sanitizeMastery,
} from '../../src/core/mastery/mastery'
import { MASTERY_KEY, MAX_MASTERY_RECORDS, type MasteryFile } from '../../src/core/mastery/types'
import { pythonPresets } from '../../src/languages/python/presets'
import manifest from '../../src/languages/python/presets/presets.json'
import { readMastery, resetMastery, saveAttempt, subscribeMastery } from '../../src/store/masteryStorage'

const NOW = 1_800_000_000_000
const IDS = manifest.map((p) => p.id)

const raw = (over: Record<string, unknown> = {}) => ({
  tool: 'trace',
  itemId: 'bubble-sort',
  attempts: 2,
  bestPercent: 60,
  lastPercent: 40,
  mastered: false,
  lastPracticedAt: NOW - 1000,
  ...over,
})
const fileWith = (records: Record<string, unknown>) => ({ v: 1, records })
const attempt = (itemId: string, percent: number, newSession = true) => ({ tool: 'trace' as const, itemId, percent, newSession })
const master = (ids: string[], at: (i: number) => number = (i) => NOW + i) =>
  ids.reduce((f, id, i) => recordAttempt(f, attempt(id, 100), at(i)), emptyMastery())

describe('sanitizeMastery', () => {
  it('keeps a good record', () => {
    expect(sanitizeMastery(fileWith({ 'trace:bubble-sort': raw() }), NOW).records['trace:bubble-sort']).toEqual(raw())
  })

  it.each([
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
    ['no version', { records: { 'trace:bubble-sort': raw() } }],
    ['a future version', { v: 2, records: { 'trace:bubble-sort': raw() } }],
    ['records as an array', { v: 1, records: [raw()] }],
  ])('ignores the whole file for %s', (_, value) => {
    expect(sanitizeMastery(value, NOW)).toEqual(emptyMastery())
  })

  it.each(['bubble-sort', 'truth:half-adder', 'trace:', 'trace:Bubble', 'trace:a b', `trace:${'a'.repeat(65)}`, '__proto__'])(
    'drops the key %j',
    (key) => {
      const records = JSON.parse(`{${JSON.stringify(key)}:${JSON.stringify(raw())}}`) as Record<string, unknown>
      expect(Object.keys(sanitizeMastery(fileWith(records), NOW).records)).toEqual([])
    },
  )

  it.each([
    ['attempts is a string', { attempts: '2' }],
    ['the best score is NaN', { bestPercent: Number.NaN }],
    ['the last score is infinite', { lastPercent: Number.POSITIVE_INFINITY }],
    ['it was practised in the future', { lastPracticedAt: NOW + 2 * 86_400_000 }],
    ['the time is negative', { lastPracticedAt: -1 }],
    ['the time is missing', { lastPracticedAt: undefined }],
  ])('drops a record when %s', (_, over) => {
    expect(sanitizeMastery(fileWith({ 'trace:bubble-sort': raw(over) }), NOW).records).toEqual({})
  })

  it('allows a day of clock difference', () => {
    const file = sanitizeMastery(fileWith({ 'trace:bubble-sort': raw({ lastPracticedAt: NOW + 3_600_000 }) }), NOW)
    expect(Object.keys(file.records)).toHaveLength(1)
  })

  it('clamps numbers, takes the tool and item from the key, and copies no other field', () => {
    const record = sanitizeMastery(
      fileWith({ 'trace:digit-sum': raw({ tool: 'evil', itemId: 'x', attempts: -5, bestPercent: 900, lastPercent: -3, extra: 1 }) }),
      NOW,
    ).records['trace:digit-sum']
    expect(record).toEqual({
      tool: 'trace',
      itemId: 'digit-sum',
      attempts: 0,
      bestPercent: 100,
      lastPercent: 0,
      mastered: true, // a best of 80 or more means mastered, whatever the stored flag says
      lastPracticedAt: NOW - 1000,
    })
  })

  it('drops a masteredAt from the future but keeps the record', () => {
    const file = sanitizeMastery(
      fileWith({ 'trace:bubble-sort': raw({ mastered: true, masteredAt: NOW + 9 * 86_400_000 }) }),
      NOW,
    )
    expect(file.records['trace:bubble-sort']).toMatchObject({ mastered: true })
    expect(file.records['trace:bubble-sort']).not.toHaveProperty('masteredAt')
  })

  it(`keeps at most ${MAX_MASTERY_RECORDS} records`, () => {
    const many = Object.fromEntries(Array.from({ length: MAX_MASTERY_RECORDS + 50 }, (_, i) => [`trace:p${i}`, raw()]))
    expect(Object.keys(sanitizeMastery(fileWith(many), NOW).records)).toHaveLength(MAX_MASTERY_RECORDS)
  })
})

describe('the qualifying rule', () => {
  it.each([
    [15, 15, true],
    [8, 15, true],
    [7, 15, false],
    [5, 10, true],
    [1, 15, false],
    [0, 0, false],
  ])('%i scored of %i questions → %s', (scored, questions, expected) => {
    expect(isQualifying(scored, questions)).toBe(expected)
  })
})

describe('recordAttempt', () => {
  const key = 'trace:bubble-sort'

  it('masters at 80 and not at 79', () => {
    expect(recordAttempt(emptyMastery(), attempt('bubble-sort', 79), NOW).records[key]).toMatchObject({ mastered: false })
    expect(recordAttempt(emptyMastery(), attempt('bubble-sort', 80), NOW).records[key]).toMatchObject({
      mastered: true,
      masteredAt: NOW,
    })
  })

  it('never lowers the best score, and mastered is sticky with its first date', () => {
    let file = recordAttempt(emptyMastery(), attempt('bubble-sort', 90), NOW)
    file = recordAttempt(file, attempt('bubble-sort', 20), NOW + 5)
    expect(file.records[key]).toEqual({
      tool: 'trace',
      itemId: 'bubble-sort',
      attempts: 2,
      bestPercent: 90,
      lastPercent: 20,
      mastered: true,
      masteredAt: NOW,
      lastPracticedAt: NOW + 5,
    })
  })

  it('checking again in the same session updates the scores but not the count', () => {
    let file = recordAttempt(emptyMastery(), attempt('bubble-sort', 40), NOW)
    file = recordAttempt(file, attempt('bubble-sort', 85, false), NOW + 5)
    expect(file.records[key]).toMatchObject({ attempts: 1, bestPercent: 85, lastPercent: 85, mastered: true })
  })

  it('counts at least one attempt for a new record', () => {
    expect(recordAttempt(emptyMastery(), attempt('bubble-sort', 40, false), NOW).records[key]).toMatchObject({ attempts: 1 })
  })

  it('refuses an id that could not be read back', () => {
    expect(recordAttempt(emptyMastery(), attempt('Not An Id', 100), NOW)).toEqual(emptyMastery())
  })

  it('does not change the file it was given', () => {
    const before = emptyMastery()
    recordAttempt(before, attempt('bubble-sort', 90), NOW)
    expect(before).toEqual(emptyMastery())
  })
})

describe('progress and what comes next', () => {
  it('starts at the first preset, in presets.json order', () => {
    expect(nextUnfinished(emptyMastery(), 'trace', IDS)).toEqual({ id: 'linear-search', revisit: false })
    expect(presetProgress(emptyMastery(), 'trace', IDS)).toEqual({ mastered: 0, total: 6, practised: 0 })
  })

  it('skips only mastered presets, following the list order and not the practice order', () => {
    let file = master(['digit-sum', 'linear-search'])
    file = recordAttempt(file, attempt('bubble-sort', 50), NOW)
    expect(nextUnfinished(file, 'trace', IDS)).toEqual({ id: 'bubble-sort', revisit: false })
    expect(presetProgress(file, 'trace', IDS)).toEqual({ mastered: 2, total: 6, practised: 3 })
  })

  it('with everything mastered, offers the one practised longest ago', () => {
    const file = master(IDS, (i) => NOW + (IDS[i] === 'factorial' ? 0 : 100 + i))
    expect(nextUnfinished(file, 'trace', IDS)).toEqual({ id: 'factorial', revisit: true })
  })

  it('keeps but does not count a record for a preset that no longer exists', () => {
    const file = master(['removed-preset', 'linear-search'])
    expect(presetProgress(file, 'trace', IDS)).toMatchObject({ mastered: 1, total: 6 })
    expect(sanitizeMastery(file, NOW + 10).records).toHaveProperty('trace:removed-preset')
  })
})

describe('matchingItemId', () => {
  const stdinOf = (id: string) => pythonPresets.find((p) => p.id === id)!.stdin ?? []
  const codeOf = (id: string) => pythonPresets.find((p) => p.id === id)!.code
  const match = (code: string, stdin: string[] = []) => matchingItemId({ code, stdin }, pythonPresets)

  it('recognises every built-in as it is', () => {
    for (const p of pythonPresets) expect(match(p.code, p.stdin ?? [])).toBe(p.id)
  })

  it('ignores line endings and trailing whitespace', () => {
    const code = codeOf('digit-sum').replace(/\r?\n/g, '\r\n')
    expect(match(`${code}\r\n\r\n  `)).toBe('digit-sum')
    expect(match(codeOf('vowel-counter').trimEnd(), [...stdinOf('vowel-counter'), ''])).toBe('vowel-counter')
  })

  it('does not count an edited program or different input', () => {
    expect(match(codeOf('digit-sum').replace('1234', '5678'))).toBeNull()
    expect(match(`# mine\n${codeOf('digit-sum')}`)).toBeNull()
    expect(match(codeOf('vowel-counter'), ['sky'])).toBeNull()
    expect(match(codeOf('digit-sum'), ['extra'])).toBeNull()
  })
})

describe('masteryStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })
  const stored = () => JSON.parse(localStorage.getItem(MASTERY_KEY) ?? 'null') as MasteryFile | null

  it('saves, gives a stable snapshot, notifies, and resets', () => {
    const listener = vi.fn()
    const stop = subscribeMastery(listener)
    saveAttempt(attempt('bubble-sort', 90))
    expect(stored()!.records['trace:bubble-sort']).toMatchObject({ bestPercent: 90 })
    expect(readMastery()).toBe(readMastery())
    resetMastery()
    expect(localStorage.getItem(MASTERY_KEY)).toBeNull()
    expect(readMastery()).toEqual(emptyMastery())
    expect(listener).toHaveBeenCalledTimes(2)
    stop()
  })

  it('hears another tab, and adds to what that tab wrote instead of overwriting it', () => {
    const listener = vi.fn()
    const stop = subscribeMastery(listener)
    saveAttempt(attempt('bubble-sort', 90))
    // the other tab
    const theirs = recordAttempt(sanitizeMastery(stored(), Date.now()), attempt('digit-sum', 100), Date.now())
    localStorage.setItem(MASTERY_KEY, JSON.stringify(theirs))
    window.dispatchEvent(new StorageEvent('storage', { key: MASTERY_KEY }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(listener).toHaveBeenCalledTimes(2)
    saveAttempt(attempt('factorial', 10))
    expect(Object.keys(stored()!.records).sort()).toEqual(['trace:bubble-sort', 'trace:digit-sum', 'trace:factorial'])
    stop()
  })

  it('ignores a corrupted value and replaces it on the next save', () => {
    localStorage.setItem(MASTERY_KEY, '{not json')
    expect(readMastery()).toEqual(emptyMastery())
    saveAttempt(attempt('bubble-sort', 90))
    expect(Object.keys(stored()!.records)).toEqual(['trace:bubble-sort'])
  })

  it('ignores a newer version’s file and never overwrites it', () => {
    const future = JSON.stringify({ v: 2, records: {}, more: true })
    localStorage.setItem(MASTERY_KEY, future)
    expect(readMastery()).toEqual(emptyMastery())
    saveAttempt(attempt('bubble-sort', 90))
    expect(localStorage.getItem(MASTERY_KEY)).toBe(future)
  })

  it('does not throw when storage is blocked or full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveAttempt(attempt('bubble-sort', 90))).not.toThrow()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readMastery()).toEqual(emptyMastery())
    expect(() => saveAttempt(attempt('bubble-sort', 90))).not.toThrow()
    expect(() => resetMastery()).not.toThrow()
  })
})
