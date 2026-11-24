import { describe, expect, it } from 'vitest'
import {
  NumberError,
  add,
  fromHex,
  fromSigned,
  fromUnsigned,
  invert,
  negate,
  parseNumberInput,
  shiftLeftArithmetic,
  shiftLeftLogical,
  shiftRightArithmetic,
  shiftRightLogical,
  toBinary,
  toHex,
  toSigned,
  toUnsigned,
  type Bits,
} from '../../src/core/numbers'

const b8 = (s: string): Bits => [...s].map((c) => (c === '1' ? 1 : 0))

describe('conversions', () => {
  it('round-trips every 8-bit value (unsigned, signed, hex, binary)', () => {
    for (let n = 0; n < 256; n++) {
      const bits = fromUnsigned(n, 8)
      expect(bits).toHaveLength(8)
      expect(toUnsigned(bits)).toBe(n)
      expect(fromSigned(toSigned(bits), 8)).toEqual(bits)
      expect(fromHex(toHex(bits), 8)).toEqual(bits)
      expect(toBinary(bits)).toBe(n.toString(2).padStart(8, '0'))
      expect(toSigned(bits)).toBe(n > 127 ? n - 256 : n)
    }
  })

  it('round-trips sampled 16-bit values', () => {
    for (const n of [0, 1, 127, 128, 255, 256, 4660, 32767, 32768, 40000, 65534, 65535]) {
      const bits = fromUnsigned(n, 16)
      expect(toUnsigned(bits)).toBe(n)
      expect(fromSigned(toSigned(bits), 16)).toEqual(bits)
      expect(toHex(bits)).toBe(n.toString(16).toUpperCase().padStart(4, '0'))
    }
    expect(toSigned(fromUnsigned(65535, 16))).toBe(-1)
    expect(toSigned(fromUnsigned(32768, 16))).toBe(-32768)
  })

  it('range-checks', () => {
    expect(() => fromUnsigned(256, 8)).toThrow(NumberError)
    expect(() => fromUnsigned(-1, 8)).toThrow(NumberError)
    expect(() => fromSigned(128, 8)).toThrow(NumberError)
    expect(() => fromSigned(-129, 8)).toThrow(NumberError)
    expect(() => fromSigned(1.5, 8)).toThrow(NumberError)
    expect(fromSigned(-128, 8)).toEqual(b8('10000000'))
    expect(fromSigned(127, 8)).toEqual(b8('01111111'))
    expect(() => fromUnsigned(65536, 16)).toThrow(NumberError)
    expect(() => fromHex('100', 8)).toThrow(NumberError)
    expect(() => fromHex('G1', 8)).toThrow(NumberError)
  })

  it('writes hex with the right number of digits', () => {
    expect(toHex(b8('00001010'))).toBe('0A')
    expect(toHex(fromUnsigned(171, 16))).toBe('00AB')
  })

  it('invert and negate', () => {
    expect(invert(b8('01001001'))).toEqual(b8('10110110'))
    expect(negate(b8('00000101'))).toEqual(b8('11111011')) // 5 -> -5
    expect(negate(b8('10000000'))).toEqual(b8('10000000')) // -128 has no positive twin
    for (let n = -127; n <= 127; n++) {
      expect(toSigned(negate(fromSigned(n, 8)))).toBe(n === 0 ? 0 : -n)
    }
  })
})

describe('parseNumberInput', () => {
  const bits = (r: ReturnType<typeof parseNumberInput>) => (r.ok ? toBinary(r.bits) : r.message)

  it('accepts binary in several spellings, and flags short input as padded', () => {
    for (const s of ['01001001', '0b0100 1001', '0100_1001', '%01001001', '01001001b']) {
      const r = parseNumberInput(s, 'bin', 8)
      expect(bits(r)).toBe('01001001')
      expect(r.ok && r.padded).toBe(false)
    }
    const short = parseNumberInput('1001001', 'bin', 8)
    expect(bits(short)).toBe('01001001')
    expect(short.ok && short.padded).toBe(true)
  })

  it('reports binary width overflow but allows redundant leading zeros', () => {
    expect(bits(parseNumberInput('100000000', 'bin', 8))).toMatch(/more than 8 bits/)
    expect(bits(parseNumberInput('000000001', 'bin', 8))).toBe('00000001')
    expect(bits(parseNumberInput('012', 'bin', 8))).toMatch(/0 and 1/)
  })

  it('accepts hex spellings', () => {
    for (const s of ['4a', '0x4A', '&4A', '#4a', '4Ah', '4_A']) {
      expect(bits(parseNumberInput(s, 'hex', 8))).toBe('01001010')
    }
    expect(bits(parseNumberInput('123', 'hex', 8))).toMatch(/too big/)
    expect(bits(parseNumberInput('FFFF', 'hex', 16))).toBe('1'.repeat(16))
  })

  it('parses denary and range-checks it', () => {
    expect(bits(parseNumberInput('73', 'unsigned', 8))).toBe('01001001')
    expect(bits(parseNumberInput('-1', 'signed', 8))).toBe('11111111')
    expect(bits(parseNumberInput('+5', 'signed', 8))).toBe('00000101')
    expect(bits(parseNumberInput('256', 'unsigned', 8))).toMatch(/does not fit/)
    expect(bits(parseNumberInput('-1', 'unsigned', 8))).toMatch(/negative/)
    expect(bits(parseNumberInput('128', 'signed', 8))).toMatch(/does not fit/)
    expect(bits(parseNumberInput('1.5', 'signed', 8))).toMatch(/whole number/)
    expect(bits(parseNumberInput('', 'signed', 8))).toMatch(/Type a number/)
    expect(bits(parseNumberInput('9'.repeat(30), 'unsigned', 8))).toMatch(/too big/)
    expect(bits(parseNumberInput('1'.repeat(100), 'bin', 8))).toMatch(/too long/)
  })
})

describe('shifts', () => {
  it('logical left and right report the bit that fell out', () => {
    const l = shiftLeftLogical(b8('11000001'))
    expect(l.bits).toEqual(b8('10000010'))
    expect(l.out).toBe(1)
    const r = shiftRightLogical(b8('11000001'))
    expect(r.bits).toEqual(b8('01100000'))
    expect(r.out).toBe(1)
    expect(shiftRightLogical(b8('10000000'), 3).bits).toEqual(b8('00010000'))
    expect(shiftRightLogical(b8('10000110'), 2)).toMatchObject({ out: 1, lost: [0, 1] })
    expect(shiftLeftLogical(b8('00000001'), 0)).toMatchObject({ out: null, lost: [] })
    expect(shiftLeftLogical(b8('11111111'), 20).bits).toEqual(b8('00000000'))
  })

  it('arithmetic right keeps the sign', () => {
    expect(shiftRightArithmetic(b8('11110000')).bits).toEqual(b8('11111000'))
    expect(shiftRightArithmetic(b8('01110000')).bits).toEqual(b8('00111000'))
    expect(shiftRightArithmetic(b8('11111111')).bits).toEqual(b8('11111111')) // -1 stays -1
    expect(shiftRightArithmetic(b8('11111011')).out).toBe(1) // -5 >> 1 = -3, rounds down
  })

  it('arithmetic left flags a lost sign or value, exhaustively', () => {
    for (let n = -128; n <= 127; n++) {
      const r = shiftLeftArithmetic(fromSigned(n, 8))
      expect(r.overflow).toBe(n * 2 < -128 || n * 2 > 127)
      expect(r.bits).toEqual(shiftLeftLogical(fromSigned(n, 8)).bits)
    }
    expect(shiftLeftArithmetic(b8('01000000')).overflow).toBe(true) // 64 -> -128
    expect(shiftLeftArithmetic(b8('11000000')).overflow).toBe(false) // -64 -> -128
    expect(shiftLeftArithmetic(b8('00000011'), 2).overflow).toBe(false)
    expect(shiftLeftArithmetic(b8('00000011'), 6).overflow).toBe(true)
  })

  it('rejects a negative count', () => {
    expect(() => shiftLeftLogical(b8('1'), -1)).toThrow(RangeError)
  })
})

describe('add', () => {
  it('matches integer arithmetic for ALL 256 x 256 8-bit additions', () => {
    for (let x = 0; x < 256; x++) {
      const a = fromUnsigned(x, 8)
      for (let y = 0; y < 256; y++) {
        const b = fromUnsigned(y, 8)
        const r = add(a, b)
        const sum = x + y
        expect(toUnsigned(r.bits)).toBe(sum % 256)
        expect(r.carryOut).toBe(sum > 255 ? 1 : 0)
        const sx = toSigned(a)
        const sy = toSigned(b)
        const ss = sx + sy
        expect(r.overflow).toBe(ss < -128 || ss > 127)
        expect(toSigned(r.bits)).toBe(r.overflow ? (ss < 0 ? ss + 256 : ss - 256) : ss)
      }
    }
  })

  it('per-column carries are consistent with the column sums', () => {
    for (const [x, y] of [[0b01111111, 1], [0b10101010, 0b01010101], [200, 100], [255, 255]]) {
      const a = fromUnsigned(x!, 8)
      const b = fromUnsigned(y!, 8)
      const r = add(a, b)
      expect(r.carries[7]).toBe(0)
      for (let i = 7; i >= 0; i--) {
        const col = a[i]! + b[i]! + r.carries[i]!
        expect(r.bits[i]).toBe(col & 1)
        const carryOut = i === 0 ? r.carryOut : r.carries[i - 1]
        expect(carryOut).toBe(col >> 1)
      }
    }
  })

  it('explains signed overflow', () => {
    const pos = add(b8('01111111'), b8('00000001'))
    expect(pos).toMatchObject({ overflow: true, carryOut: 0, overflowReason: 'two positives gave a negative' })
    const neg = add(b8('10000000'), b8('11111111'))
    expect(neg).toMatchObject({ overflow: true, carryOut: 1, overflowReason: 'two negatives gave a positive' })
    const none = add(b8('11111111'), b8('00000001'))
    expect(none).toMatchObject({ overflow: false, carryOut: 1, overflowReason: null })
  })

  it('honours a carry in, and rejects mixed widths', () => {
    expect(toUnsigned(add(b8('00000001'), b8('00000001'), 1).bits)).toBe(3)
    expect(() => add(b8('1'), b8('11'))).toThrow(NumberError)
  })

  it('adds sampled 16-bit values', () => {
    for (const [x, y] of [[0, 0], [1, 65535], [32767, 1], [40000, 30000], [65535, 65535], [12345, 23456]]) {
      const r = add(fromUnsigned(x!, 16), fromUnsigned(y!, 16))
      expect(toUnsigned(r.bits)).toBe((x! + y!) % 65536)
      expect(r.carryOut).toBe(x! + y! > 65535 ? 1 : 0)
    }
    expect(add(fromUnsigned(32767, 16), fromUnsigned(1, 16)).overflow).toBe(true)
  })
})
