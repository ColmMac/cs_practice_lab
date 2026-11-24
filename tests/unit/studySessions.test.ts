import { describe, expect, it } from 'vitest'
import {
  MAX_ANSWER_LENGTH,
  MAX_ANSWERS,
  MAX_STUDY_SESSIONS,
  rememberSession,
  sanitizeSeed,
  sanitizeSessions,
  sanitizeStudyConfig,
  type StudySessionData,
} from '../../src/core/study/session'
import { DEFAULT_STUDY_CONFIG } from '../../src/core/study/types'
import { defaultWorkspace, sanitizeWorkspace } from '../../src/core/workspace'
import { mergePersisted, type PersistedState } from '../../src/store/persistence'

const data = (answers: Record<string, string> = {}, extra: Partial<StudySessionData> = {}): StudySessionData => ({
  config: { ...DEFAULT_STUDY_CONFIG },
  seed: 7,
  answers,
  revealed: [],
  ...extra,
})

describe('sanitizeStudyConfig', () => {
  it('keeps a valid config', () => {
    const c = { maskMode: 'random', percent: 30, columns: ['a', 'b'], outputOnly: true, closeCredit: 0 } as const
    expect(sanitizeStudyConfig(c)).toEqual(c)
  })

  it('repairs field by field', () => {
    expect(sanitizeStudyConfig({ maskMode: 'weird', percent: 'lots', columns: 'x', outputOnly: 'yes', closeCredit: 0.7 })).toEqual(DEFAULT_STUDY_CONFIG)
    expect(sanitizeStudyConfig({ maskMode: 'columns' }).maskMode).toBe('columns')
  })

  it('clamps and rounds the percentage', () => {
    expect(sanitizeStudyConfig({ percent: 250 }).percent).toBe(100)
    expect(sanitizeStudyConfig({ percent: -4 }).percent).toBe(0)
    expect(sanitizeStudyConfig({ percent: 33.6 }).percent).toBe(34)
    expect(sanitizeStudyConfig({ percent: NaN }).percent).toBe(DEFAULT_STUDY_CONFIG.percent)
    expect(sanitizeStudyConfig({ percent: Infinity }).percent).toBe(DEFAULT_STUDY_CONFIG.percent)
  })

  it('cleans the column list', () => {
    const out = sanitizeStudyConfig({ columns: ['a', 'a', 3, '', null, 'b'.repeat(201), 'ok'] })
    expect(out.columns).toEqual(['a', 'ok'])
    expect(sanitizeStudyConfig({ columns: Array.from({ length: 1000 }, (_, i) => `c${i}`) }).columns).toHaveLength(300)
  })

  it('only accepts 0 or 0.5 for closeCredit', () => {
    for (const bad of [1, 0.25, -1, '0.5', null]) expect(sanitizeStudyConfig({ closeCredit: bad }).closeCredit).toBe(0.5)
    expect(sanitizeStudyConfig({ closeCredit: 0 }).closeCredit).toBe(0)
  })

  it('treats non-objects as empty', () => {
    for (const bad of [null, undefined, 3, 'x', [], true]) expect(sanitizeStudyConfig(bad)).toEqual(DEFAULT_STUDY_CONFIG)
  })
})

describe('sanitizeSeed', () => {
  it('accepts 32-bit unsigned integers only', () => {
    expect(sanitizeSeed(0)).toBe(0)
    expect(sanitizeSeed(4294967295)).toBe(4294967295)
    for (const bad of [-1, 4294967296, 1.5, NaN, Infinity, '7', null, undefined]) expect(sanitizeSeed(bad, 9)).toBe(9)
  })
})

describe('sanitizeSessions', () => {
  it('keeps valid sessions', () => {
    const s = { abc123: data({ '3:<module>:x': '5' }, { revealed: ['4:output'] }) }
    expect(sanitizeSessions(s, ['abc123'])).toEqual({ studySessions: s, studyOrder: ['abc123'] })
  })

  it('drops bad ids, bad answers and malformed sessions', () => {
    const out = sanitizeSessions(
      {
        'bad id with spaces': data(),
        '': data(),
        __proto__: data(),
        good: data({
          '1:a': 'ok',
          'no-colon': 'x',
          '1:': 'x',
          'x1:a': 'x',
          '2:b': 5 as unknown as string,
          '3:c': 'z'.repeat(MAX_ANSWER_LENGTH + 1),
          '__proto__': 'x',
        }),
        junk: 'not an object',
        nothing: null,
      },
      ['good', 'junk'],
    )
    expect(Object.keys(out.studySessions)).toEqual(['good'])
    expect(out.studySessions.good!.answers).toEqual({ '1:a': 'ok' })
    expect(out.studyOrder).toEqual(['good'])
  })

  it('caps the number of answers per session', () => {
    const many = Object.fromEntries(Array.from({ length: MAX_ANSWERS + 50 }, (_, i) => [`${i}:a`, 'x']))
    expect(Object.keys(sanitizeSessions({ s: data(many) }, ['s']).studySessions.s!.answers)).toHaveLength(MAX_ANSWERS)
  })

  it('cleans the revealed list', () => {
    const out = sanitizeSessions({ s: { ...data(), revealed: ['1:a', '1:a', 'nope', 5, null, '2:b'] } }, ['s'])
    expect(out.studySessions.s!.revealed).toEqual(['1:a', '2:b'])
  })

  it('reconciles the order list with the sessions that exist', () => {
    const out = sanitizeSessions({ a: data(), b: data(), c: data() }, ['c', 'ghost', 'a', 'a'])
    expect(out.studyOrder).toEqual(['c', 'a', 'b']) // unknown dropped, duplicates dropped, forgotten sessions appended
  })

  it('keeps at most the 5 most recent, forgetting the oldest first', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const out = sanitizeSessions(Object.fromEntries(ids.map((i) => [i, data()])), ids)
    expect(out.studyOrder).toEqual(['c', 'd', 'e', 'f', 'g'])
    expect(Object.keys(out.studySessions).sort()).toEqual(['c', 'd', 'e', 'f', 'g'])
  })

  it('treats garbage as no sessions', () => {
    for (const bad of [null, undefined, 3, 'x', [], true]) {
      expect(sanitizeSessions(bad, bad)).toEqual({ studySessions: {}, studyOrder: [] })
    }
  })

  it('does not pollute prototypes', () => {
    sanitizeSessions(JSON.parse('{"__proto__": {"polluted": 1}, "constructor": {"prototype": {"polluted": 1}}}'), ['__proto__'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })
})

describe('rememberSession (5 most recent, keyed by executionKey)', () => {
  it('adds the newest last and moves a re-used session to the end', () => {
    let state = { studySessions: {} as Record<string, StudySessionData>, studyOrder: [] as string[] }
    for (const id of ['a', 'b', 'c']) state = rememberSession(state.studySessions, state.studyOrder, id, data())
    state = rememberSession(state.studySessions, state.studyOrder, 'a', data({ '1:x': 'again' }))
    expect(state.studyOrder).toEqual(['b', 'c', 'a'])
    expect(state.studySessions.a!.answers).toEqual({ '1:x': 'again' })
  })

  it('forgets the oldest once there are more than 5', () => {
    let state = { studySessions: {} as Record<string, StudySessionData>, studyOrder: [] as string[] }
    for (let i = 0; i < 8; i++) state = rememberSession(state.studySessions, state.studyOrder, `s${i}`, data())
    expect(state.studyOrder).toEqual(['s3', 's4', 's5', 's6', 's7'])
    expect(Object.keys(state.studySessions)).toHaveLength(MAX_STUDY_SESSIONS)
    expect(state.studySessions.s0).toBeUndefined()
  })

  it('does not mutate its inputs', () => {
    const sessions = { a: data() }
    const order = ['a']
    rememberSession(sessions, order, 'b', data())
    expect(Object.keys(sessions)).toEqual(['a'])
    expect(order).toEqual(['a'])
  })
})

describe('study settings in the workspace (persisted and shared)', () => {
  it('default workspace has study defaults, and a seed of 0 meaning "not chosen"', () => {
    const w = defaultWorkspace()
    expect(w.studyConfig).toEqual(DEFAULT_STUDY_CONFIG)
    expect(w.studySeed).toBe(0)
    expect(w.studyConfig).not.toBe(DEFAULT_STUDY_CONFIG) // not the shared constant: mutating one must not change the other
  })

  it('sanitizeWorkspace repairs bad study settings and keeps good ones', () => {
    const base = defaultWorkspace('x')
    const good = { maskMode: 'columns', percent: 10, columns: ['<module>:x'], outputOnly: false, closeCredit: 0 }
    expect(sanitizeWorkspace({ studyConfig: good, studySeed: 99 }, base)).toMatchObject({ studyConfig: good, studySeed: 99 })
    expect(sanitizeWorkspace({ studyConfig: 'junk', studySeed: -5 }, base)).toMatchObject({ studyConfig: base.studyConfig, studySeed: 0 })
  })

  it('old stored workspaces without study fields still load', () => {
    const old = { code: 'x = 1', granularity: 'compact' }
    expect(sanitizeWorkspace(old, defaultWorkspace())).toMatchObject({ code: 'x = 1', studyConfig: DEFAULT_STUDY_CONFIG, studySeed: 0 })
  })

  it('mergePersisted restores sessions alongside the workspace, sanitised', () => {
    const current: PersistedState = { ...defaultWorkspace('now'), studySessions: {}, studyOrder: [] }
    const merged = mergePersisted(
      { code: 'saved', studySessions: { k1: data({ '1:a': '5', bad: 'x' }) }, studyOrder: ['k1'] },
      current,
    )
    expect(merged.code).toBe('saved')
    expect(merged.studySessions.k1!.answers).toEqual({ '1:a': '5' })
    expect(merged.studyOrder).toEqual(['k1'])
    expect(mergePersisted('garbage', current)).toEqual(current)
    expect(mergePersisted(undefined, current)).toEqual(current)
  })
})
