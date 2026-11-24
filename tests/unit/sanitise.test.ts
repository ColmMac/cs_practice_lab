import { describe, expect, it } from 'vitest'
import { MAX_LENGTH } from '../../src/core/logic'
import { sanitiseExpr } from '../../src/core/logic/sanitise'

describe('sanitiseExpr', () => {
  it('passes plain expressions and newlines through', () => {
    expect(sanitiseExpr('S = A XOR B\nC = A AND B')).toBe('S = A XOR B\nC = A AND B')
    expect(sanitiseExpr('A ⊕ B ¬')).toBe('A ⊕ B ¬')
  })
  it('normalises CRLF and strips control characters', () => {
    expect(sanitiseExpr('A\r\nB')).toBe('A\nB')
    expect(sanitiseExpr('A\u0000\u0007\tB\u007f')).toBe('AB')
  })
  it('caps the length and rejects non-strings', () => {
    expect(sanitiseExpr('A'.repeat(MAX_LENGTH + 50))).toHaveLength(MAX_LENGTH)
    expect(sanitiseExpr(null)).toBe('')
    expect(sanitiseExpr(42)).toBe('')
  })
})
