import LZString from 'lz-string'
import { describe, expect, it } from 'vitest'
import { buildChallengeUrl, decodeShare, encodeShare, MAX_SHARE_PAYLOAD, parseShareHash } from '../../src/core/share/urlState'
import { selectMasks } from '../../src/core/study/mask'
import { sanitizeStudyConfig } from '../../src/core/study/session'
import { DEFAULT_STUDY_CONFIG, MAX_MASK_CELLS, type StudyConfig } from '../../src/core/study/types'
import { defaultWorkspace, type Workspace } from '../../src/core/workspace'

const SPEC = { steps: 15, executionKey: 'k3j9x0a' }
const ws: Workspace = {
  ...defaultWorkspace('total = 0\n'),
  studyConfig: { ...DEFAULT_STUDY_CONFIG, maskMode: 'cells', cells: ['1:<module>:total', '4:output'] },
  studySeed: 77,
}

/** A payload built by hand, the way someone tampering with a link would. */
const forge = (extra: Record<string, unknown>) =>
  LZString.compressToEncodedURIComponent(JSON.stringify({ v: 1, ...ws, ...extra }))
const good = { mode: 'quiz', ch: { n: SPEC.steps, ek: SPEC.executionKey } }

describe('challenge links', () => {
  it('round-trips the workspace, the mask and the spec', () => {
    expect(decodeShare(encodeShare(ws, SPEC))).toEqual({ workspace: ws, mode: 'quiz', challenge: SPEC })
  })

  it('an ordinary share link is not a challenge', () => {
    expect(decodeShare(encodeShare(ws))).toEqual({ workspace: ws, mode: 'workspace' })
  })

  it('builds a #s= URL and says whether it can be opened', () => {
    const link = buildChallengeUrl('https://example.test/trace-table#old', ws, SPEC)
    expect(link.url.startsWith('https://example.test/trace-table#s=')).toBe(true)
    expect(link).toMatchObject({ length: link.url.length, tooLong: false, unreadable: false })
    expect(decodeShare(parseShareHash(new URL(link.url).hash)!)).toMatchObject({ mode: 'quiz', challenge: SPEC })
  })

  it('flags a link too big to be opened again', () => {
    const noisy = Array.from({ length: 1500 }, (_, i) => `v${i} = ${Math.sin(i)}`).join('\n')
    const link = buildChallengeUrl('https://e.test/', { ...ws, code: noisy }, SPEC)
    expect(link).toMatchObject({ tooLong: true, unreadable: true })
    expect(decodeShare(parseShareHash(new URL(link.url).hash)!)).toBeNull()
  })

  it.each(['Quiz', 'QUIZ', 'exam', '', true, 1, ['quiz'], { quiz: true }, null])(
    'mode %j is not exactly "quiz", so the link is a plain shared workspace',
    (mode) => {
      expect(decodeShare(forge({ ...good, mode }))).toEqual({ workspace: ws, mode: 'workspace' })
    },
  )

  it.each<[string, unknown]>([
    ['missing', undefined],
    ['not an object', 'yes'],
    ['an array', [15, 'abc']],
    ['empty', {}],
    ['zero steps', { n: 0, ek: 'abc' }],
    ['negative steps', { n: -3, ek: 'abc' }],
    ['more steps than a run can record', { n: 1001, ek: 'abc' }],
    ['fractional steps', { n: 1.5, ek: 'abc' }],
    ['steps as text', { n: '15', ek: 'abc' }],
    ['no key', { n: 15 }],
    ['an empty key', { n: 15, ek: '' }],
    ['a key with odd characters', { n: 15, ek: '<script>' }],
    ['an overlong key', { n: 15, ek: 'a'.repeat(17) }],
    ['a numeric key', { n: 15, ek: 12 }],
  ])('a forged spec (%s) leaves no challenge to start', (_name, ch) => {
    const out = decodeShare(forge({ mode: 'quiz', ch }))
    expect(out).toEqual({ workspace: ws, mode: 'quiz' })
    expect(out).not.toHaveProperty('challenge')
  })

  it('the challenge keys never leak into the workspace', () => {
    const out = decodeShare(forge({ ...good, challenge: { stage: 'active' }, studyOnRun: {}, shared: null }))!
    expect(Object.keys(out.workspace).sort()).toEqual(Object.keys(defaultWorkspace()).sort())
  })

  it('study settings in a challenge are clamped and checked like any others', () => {
    const out = decodeShare(forge({ ...good, studyConfig: { maskMode: 'everything', percent: 9999, cells: 'all', closeCredit: 1 } }))!
    expect(out.workspace.studyConfig).toEqual({ ...DEFAULT_STUDY_CONFIG, percent: 100 })
    expect(decodeShare(forge({ ...good, studyConfig: { percent: -4 } }))!.workspace.studyConfig.percent).toBe(0)
  })

  it('oversized and truncated payloads are refused outright', () => {
    expect(decodeShare('A'.repeat(MAX_SHARE_PAYLOAD + 1))).toBeNull()
    expect(decodeShare(encodeShare(ws, SPEC).slice(0, 40))).toBeNull()
  })
})

describe('hand-picked cells', () => {
  it('drops malformed keys and duplicates', () => {
    const cells = ['1:x', '1:x', 'x', ':x', '1:', '-1:x', '1:has space', 7, null, `1234567890:x`, `1:${'a'.repeat(201)}`, '2:output']
    expect(sanitizeStudyConfig({ maskMode: 'cells', cells }).cells).toEqual(['1:x', '2:output'])
  })

  it(`keeps at most ${MAX_MASK_CELLS}`, () => {
    const cells = Array.from({ length: MAX_MASK_CELLS + 50 }, (_, i) => `${i}:x`)
    expect(sanitizeStudyConfig({ cells }).cells).toHaveLength(MAX_MASK_CELLS)
  })

  const questions = [
    { key: '0:<module>:n', stepIndex: 0, rowIndex: 0, colId: '<module>:n', truth: { kind: 'output' as const, text: '1' } },
    { key: '3:output', stepIndex: 3, rowIndex: 1, colId: 'output', truth: { kind: 'output' as const, text: '1' } },
  ]
  const config = (patch: Partial<StudyConfig>): StudyConfig => ({ ...DEFAULT_STUDY_CONFIG, maskMode: 'cells', ...patch })

  it('masks exactly the chosen questions; stale or forged keys mask nothing', () => {
    expect([...selectMasks(questions, config({ cells: ['3:output', '99:nope', '0:<module>:gone'] }), 1)]).toEqual(['3:output'])
    expect(selectMasks(questions, config({ cells: [] }), 1).size).toBe(0)
  })

  it('"Only hide the Output column" still wins', () => {
    expect([...selectMasks(questions, config({ cells: ['0:<module>:n'], outputOnly: true }), 1)]).toEqual(['3:output'])
  })
})
