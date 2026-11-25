import LZString from 'lz-string'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  buildShareUrl,
  decodeShare,
  encodeShare,
  MAX_SHARE_PAYLOAD,
  parseShareHash,
  SHARE_URL_WARN_LENGTH,
} from '../../src/core/share/urlState'
import { defaultWorkspace, LIMITS, sanitizeWorkspace, type Workspace } from '../../src/core/workspace'
import { mergeWorkspace, migrateWorkspace, safeStorage } from '../../src/store/persistence'

const base = defaultWorkspace('print(1)\n')
const full: Workspace = {
  language: 'python',
  code: 'def f(n):\n    return n\nprint(f(2))\n',
  stdinText: 'a\nb',
  granularity: 'every-line',
  displayStyle: 'carry',
  hiddenColumns: ['stack', '<module>:x'],
  columnOrder: ['f:n', '<module>:x'],
  showEphemeral: true,
  showCallables: true,
  showCondition: true,
  watches: [
    { id: 'w1', expr: 'n * 2', scope: { kind: 'function', name: 'f' }, enabled: true },
    { id: 'w2', expr: 'x', label: 'the x', scope: { kind: 'module' }, enabled: false },
  ],
  studyConfig: { maskMode: 'random', percent: 40, columns: ['f:n'], cells: ['3:f:n'], outputOnly: true, closeCredit: 0 },
  studySeed: 123456789,
}

describe('sanitizeWorkspace', () => {
  it('keeps a valid workspace exactly', () => {
    expect(sanitizeWorkspace(full, base)).toEqual(full)
  })

  it('falls back field by field, never wholesale', () => {
    const out = sanitizeWorkspace({ code: 'x = 1', granularity: 'nonsense', hiddenColumns: 'nope', watches: 5 }, base)
    expect(out.code).toBe('x = 1')
    expect(out.granularity).toBe(base.granularity)
    expect(out.hiddenColumns).toEqual(base.hiddenColumns)
    expect(out.watches).toEqual([])
  })

  it('treats non-objects as empty', () => {
    for (const bad of [null, undefined, 42, 'str', [], true]) expect(sanitizeWorkspace(bad, base)).toEqual(base)
  })

  it('rejects unknown languages', () => {
    expect(sanitizeWorkspace({ language: 'cobol' }, base).language).toBe('python')
    expect(sanitizeWorkspace({ language: 'java' }, base).language).toBe('java')
  })

  it('enforces size limits', () => {
    expect(sanitizeWorkspace({ code: 'x'.repeat(LIMITS.code + 1) }, base).code).toBe(base.code)
    expect(sanitizeWorkspace({ stdinText: 'x'.repeat(LIMITS.stdin + 1) }, base).stdinText).toBe(base.stdinText)
    const many = Array.from({ length: 1000 }, (_, i) => `c${i}`)
    expect(sanitizeWorkspace({ hiddenColumns: many }, base).hiddenColumns).toHaveLength(LIMITS.columnIds)
    const watches = Array.from({ length: 50 }, (_, i) => ({ id: `w${i}`, expr: 'x' }))
    expect(sanitizeWorkspace({ watches }, base).watches).toHaveLength(LIMITS.watches)
    const long = sanitizeWorkspace({ watches: [{ id: 'a', expr: 'x'.repeat(LIMITS.watchExprLength + 1) }] }, base)
    expect(long.watches).toEqual([])
  })

  it('cleans watches: needs id + expr, unique ids, valid scope, enabled defaults on', () => {
    const out = sanitizeWorkspace(
      {
        watches: [
          { id: 'a', expr: 'x', scope: { kind: 'function', name: 'f' } },
          { id: 'a', expr: 'duplicate id' },
          { expr: 'no id' },
          { id: 'b' },
          { id: 'c', expr: 'y', scope: { kind: 'evil' }, enabled: false },
          { id: 'd', expr: 'z', scope: { kind: 'function' } },
          'junk',
          null,
        ],
      },
      base,
    )
    expect(out.watches).toEqual([
      { id: 'a', expr: 'x', scope: { kind: 'function', name: 'f' }, enabled: true },
      { id: 'c', expr: 'y', scope: { kind: 'current' }, enabled: false },
      { id: 'd', expr: 'z', scope: { kind: 'current' }, enabled: true },
    ])
  })

  it('dedupes and type-checks column id lists', () => {
    const out = sanitizeWorkspace({ hiddenColumns: ['a', 'a', 3, null, 'b'], columnOrder: [] }, base)
    expect(out.hiddenColumns).toEqual(['a', 'b'])
    expect(out.columnOrder).toEqual([])
  })

  it('is immune to prototype pollution', () => {
    const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "code": "x"}')
    const out = sanitizeWorkspace(evil, base)
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.keys(out).sort()).toEqual(Object.keys(base).sort())
  })
})

describe('share links', () => {
  it('round-trips everything', () => {
    expect(decodeShare(encodeShare(full))).toEqual({ workspace: full, mode: 'workspace' })
  })

  it('produces URL-safe payloads, and compresses realistic programs', () => {
    expect(encodeShare(full)).toMatch(/^[A-Za-z0-9+\-$]+$/)
    const program = Array.from({ length: 30 }, (_, i) => `total_${i % 3} = total_${i % 3} + items[${i}]`).join('\n')
    const big = { ...full, code: program }
    expect(encodeShare(big).length).toBeLessThan(JSON.stringify(big).length * 0.75)
  })

  it('parses #s= hashes', () => {
    expect(parseShareHash('#s=abc')).toBe('abc')
    expect(parseShareHash('s=abc')).toBe('abc')
    for (const no of ['', '#', '#s=', '#x=abc', '#other']) expect(parseShareHash(no)).toBeNull()
  })

  it('builds a URL and drops any existing hash', () => {
    const { url, length, tooLong } = buildShareUrl('https://example.test/app/?q=1#old', full)
    expect(url.startsWith('https://example.test/app/?q=1#s=')).toBe(true)
    expect(url).not.toContain('#old')
    expect(length).toBe(url.length)
    expect(tooLong).toBe(false)
  })

  it('warns when the link is long', () => {
    const noisy = Array.from({ length: 800 }, (_, i) => `v${i} = ${Math.sin(i)}`).join('\n')
    const { tooLong, length } = buildShareUrl('https://e.test/', { ...full, code: noisy })
    expect(length).toBeGreaterThan(SHARE_URL_WARN_LENGTH)
    expect(tooLong).toBe(true)
  })

  describe('hostile or broken payloads never throw and never half-load', () => {
    const enc = (o: unknown) => LZString.compressToEncodedURIComponent(JSON.stringify(o))
    it.each([
      ['empty', ''],
      ['garbage', '!!!!not-a-link!!!!'],
      ['truncated', encodeShare(full).slice(0, 20)],
      ['valid compression of non-JSON', LZString.compressToEncodedURIComponent('not json')],
      ['JSON array', enc([1, 2])],
      ['JSON null', enc(null)],
      ['unknown schema version', enc({ v: 99, code: 'x' })],
      ['missing version', enc({ code: 'x' })],
      ['empty code', enc({ v: 1, code: '' })],
      ['non-string code', enc({ v: 1, code: { a: 1 } })],
    ])('%s → null', (_name, payload) => {
      expect(decodeShare(payload)).toBeNull()
    })

    // Building the bomb means compressing 1.5 MB, which is slow when the whole suite runs in parallel: allow time.
    it('refuses oversized payloads before decompressing (decompression bomb)', { timeout: 30_000 }, () => {
      const bomb = LZString.compressToEncodedURIComponent('a'.repeat(1_500_000))
      expect(bomb.length).toBeLessThan(MAX_SHARE_PAYLOAD) // tiny on the wire (~2.8 kB)…
      const huge = 'A'.repeat(MAX_SHARE_PAYLOAD + 1)
      const t = performance.now()
      expect(decodeShare(huge)).toBeNull()
      expect(performance.now() - t).toBeLessThan(50)
      expect(decodeShare(bomb)).toBeNull() // …but inflates to 1.5 MB of junk, which is not valid JSON anyway
    })

    it('sanitises the fields of an otherwise valid payload', () => {
      const out = decodeShare(enc({ v: 1, code: 'x = 1', granularity: 'weird', watches: [{ id: 1, expr: 2 }], language: 'cobol' }))?.workspace
      expect(out).toMatchObject({ code: 'x = 1', granularity: 'compact', language: 'python', watches: [] })
    })

    it('ignores prototype-pollution attempts inside a payload', () => {
      const payload = LZString.compressToEncodedURIComponent('{"v":1,"code":"x","__proto__":{"polluted":1}}')
      decodeShare(payload)
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    })
  })
})

describe('persistence helpers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('migrate keeps the current version and discards unknown ones', () => {
    expect(migrateWorkspace({ code: 'x' }, 1)).toEqual({ code: 'x' })
    expect(migrateWorkspace({ code: 'x' }, 0)).toBeUndefined()
    expect(migrateWorkspace({ code: 'x' }, 7)).toBeUndefined()
  })

  it('merge lays stored data over the current state, field by field, and keeps other fields', () => {
    const current = { ...base, runnerExtra: 'kept' }
    const merged = mergeWorkspace({ code: 'stored', granularity: 'bogus' }, current)
    expect(merged.code).toBe('stored')
    expect(merged.granularity).toBe(base.granularity)
    expect(merged.runnerExtra).toBe('kept')
    expect(mergeWorkspace(undefined, current)).toEqual(current)
    expect(mergeWorkspace('garbage', current)).toEqual(current)
  })

  it('safeStorage never throws when localStorage is blocked', () => {
    const blocked = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => { throw new Error('SecurityError') },
    }
    vi.stubGlobal('localStorage', blocked)
    expect(safeStorage.getItem('k')).toBeNull()
    expect(() => safeStorage.setItem('k', 'v')).not.toThrow()
    expect(() => safeStorage.removeItem('k')).not.toThrow()
  })

  it('safeStorage reads and writes normally otherwise', () => {
    const mem = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    })
    safeStorage.setItem('k', 'v')
    expect(safeStorage.getItem('k')).toBe('v')
    safeStorage.removeItem('k')
    expect(safeStorage.getItem('k')).toBeNull()
  })
})
