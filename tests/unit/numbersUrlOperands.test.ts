import { describe, expect, it } from 'vitest'
import { parseNumberUrl } from '../../src/core/numbers/urlState'
import { toBinary } from '../../src/core/numbers'

const parse = (q: string) => parseNumberUrl(new URLSearchParams(q))

describe('addition operands in the URL', () => {
  it('reads a and b as 8-bit binary', () => {
    const s = parse('mode=add&a=01111111&b=1')
    expect(s.width).toBe(8)
    expect(toBinary(s.a!)).toBe('01111111')
    expect(toBinary(s.b!)).toBe('00000001')
  })
  it('a longer operand switches to 16-bit', () => {
    const s = parse('mode=add&a=100000000&b=1')
    expect(s.width).toBe(16)
    expect(toBinary(s.a!)).toBe('0000000100000000')
  })
  it('ignores anything that is not binary', () => {
    const s = parse('a=2&b=xyz')
    expect(s.a).toBeNull()
    expect(s.b).toBeNull()
  })
})
