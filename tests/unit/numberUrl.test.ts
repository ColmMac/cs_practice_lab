import { describe, expect, it } from 'vitest'
import { fromUnsigned, numberUrlParams, parseNumberUrl } from '../../src/core/numbers'

const parse = (q: string) => parseNumberUrl(new URLSearchParams(q))

describe('parseNumberUrl', () => {
  it('defaults to the 8-bit sandbox', () => {
    expect(parse('')).toEqual({ mode: 'sandbox', width: 8, bits: null, topic: null, seed: null })
  })
  it('reads mode, bits, topic and seed', () => {
    const s = parse('mode=practice&topic=twos&seed=42')
    expect(s).toMatchObject({ mode: 'practice', topic: 'twos', seed: 42 })
    expect(parse('bits=01001001').bits).toEqual([0, 1, 0, 0, 1, 0, 0, 1])
    expect(parse('bits=0b1').bits).toEqual(fromUnsigned(1, 8))
  })
  it('infers 16-bit from a long register, and lets an explicit width win', () => {
    expect(parse('bits=0000000011111111').width).toBe(16)
    expect(parse('width=16').width).toBe(16)
    const narrow = parse('bits=0000000011111111&width=8')
    expect(narrow.width).toBe(8)
    expect(narrow.bits).toEqual(fromUnsigned(255, 8))
  })
  it('ignores anything odd', () => {
    expect(parse('mode=admin&bits=012&topic=__proto__&seed=-1&width=7')).toEqual({
      mode: 'sandbox', width: 8, bits: null, topic: null, seed: null,
    })
    expect(parse('bits=' + '1'.repeat(17)).bits).toBeNull()
    expect(parse('seed=99999999999').seed).toBeNull()
    expect(parse('topic=constructor').topic).toBeNull()
  })
})

describe('numberUrlParams', () => {
  const bits = fromUnsigned(73, 8)
  it('leaves defaults out', () => {
    expect(numberUrlParams({ mode: 'sandbox', width: 8, bits: fromUnsigned(0, 8), topic: null, seed: 1 })).toEqual({})
    expect(numberUrlParams({ mode: 'sandbox', width: 8, bits, topic: null, seed: 1 })).toEqual({ bits: '01001001' })
  })
  it('writes the seed and topic for practice, and round-trips', () => {
    const q = numberUrlParams({ mode: 'practice', width: 8, bits, topic: 'hex', seed: 7 })
    expect(q).toEqual({ mode: 'practice', topic: 'hex', seed: '7' })
    expect(parse(new URLSearchParams(q).toString())).toMatchObject({ mode: 'practice', topic: 'hex', seed: 7 })
  })
})
