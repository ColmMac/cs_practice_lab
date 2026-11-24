/**
 * Fixed-width bit-array model (N3.1). Pure and language-agnostic.
 *
 * A register is an array of 0/1 values, MOST significant bit first (index 0),
 * exactly as written on an exam paper. Its length is the width (8 or 16).
 */

export type Bit = 0 | 1
export type Bits = readonly Bit[]
export const WIDTHS = [8, 16] as const
export type Width = (typeof WIDTHS)[number]

/** Thrown for out-of-range values and malformed registers. */
export class NumberError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NumberError'
  }
}

export const isWidth = (n: unknown): n is Width => n === 8 || n === 16

const assertWidth = (width: number): Width => {
  if (!isWidth(width)) throw new NumberError(`Width must be 8 or 16, not ${width}.`)
  return width
}

export const unsignedRange = (width: Width): { min: number; max: number } => ({
  min: 0,
  max: 2 ** width - 1,
})
export const signedRange = (width: Width): { min: number; max: number } => ({
  min: -(2 ** (width - 1)),
  max: 2 ** (width - 1) - 1,
})

/** Bit weight at an index: 128, 64, … 1 (the sign bit is +128 unsigned, -128 signed). */
export const bitWeight = (index: number, width: Width): number => 2 ** (width - 1 - index)

export const toUnsigned = (bits: Bits): number => {
  let n = 0
  for (const b of bits) n = n * 2 + b
  return n
}

export const toSigned = (bits: Bits): number => {
  const u = toUnsigned(bits)
  return bits[0] === 1 ? u - 2 ** bits.length : u
}

export const fromUnsigned = (n: number, width: Width): Bits => {
  assertWidth(width)
  const { min, max } = unsignedRange(width)
  if (!Number.isInteger(n)) throw new NumberError(`${n} is not a whole number.`)
  if (n < min || n > max) {
    throw new NumberError(`${n} does not fit in ${width} bits unsigned (${min} to ${max}).`)
  }
  const out: Bit[] = new Array<Bit>(width)
  let rest = n
  for (let i = width - 1; i >= 0; i--) {
    out[i] = (rest % 2) as Bit
    rest = Math.floor(rest / 2)
  }
  return out
}

export const fromSigned = (n: number, width: Width): Bits => {
  assertWidth(width)
  const { min, max } = signedRange(width)
  if (!Number.isInteger(n)) throw new NumberError(`${n} is not a whole number.`)
  if (n < min || n > max) {
    throw new NumberError(`${n} does not fit in ${width} bits two's complement (${min} to ${max}).`)
  }
  return fromUnsigned(n < 0 ? n + 2 ** width : n, width)
}

export const toBinary = (bits: Bits): string => bits.join('')

/** Binary text of exactly `width` 0/1 characters. */
export const fromBinary = (text: string, width: Width): Bits => {
  assertWidth(width)
  if (!/^[01]+$/.test(text)) throw new NumberError('Binary uses only the digits 0 and 1.')
  if (text.length !== width) throw new NumberError(`Write exactly ${width} bits.`)
  return [...text].map((c) => (c === '1' ? 1 : 0))
}

export const toHex = (bits: Bits): string =>
  toUnsigned(bits)
    .toString(16)
    .toUpperCase()
    .padStart(bits.length / 4, '0')

export const fromHex = (text: string, width: Width): Bits => {
  assertWidth(width)
  if (!/^[0-9a-fA-F]+$/.test(text)) throw new NumberError('Hex uses the digits 0-9 and A-F.')
  const significant = text.replace(/^0+/, '')
  if (significant.length > width / 4) {
    throw new NumberError(`That hex value is too big for ${width} bits (at most ${width / 4} digits).`)
  }
  return fromUnsigned(parseInt(text, 16), width)
}

/** Invert every bit (one's complement). */
export const invert = (bits: Bits): Bits => bits.map((b) => (b === 1 ? 0 : 1) as Bit)

/** Two's complement negation: invert, then add 1. -128 negates to itself. */
export const negate = (bits: Bits): Bits => {
  const flipped = invert(bits)
  const one = fromUnsigned(1, bits.length as Width)
  return addBits(flipped, one).bits
}

/** Shared by `negate` and `add` (declared here to avoid a circular import). */
export const addBits = (
  a: Bits,
  b: Bits,
  carryIn: Bit = 0,
): { bits: Bits; carries: Bits; carryOut: Bit } => {
  if (a.length !== b.length) throw new NumberError('Both registers must be the same width.')
  const n = a.length
  const bits: Bit[] = new Array<Bit>(n)
  const carries: Bit[] = new Array<Bit>(n)
  let carry: Bit = carryIn
  for (let i = n - 1; i >= 0; i--) {
    carries[i] = carry
    const sum = a[i]! + b[i]! + carry
    bits[i] = (sum & 1) as Bit
    carry = (sum >> 1) as Bit
  }
  return { bits, carries, carryOut: carry }
}
