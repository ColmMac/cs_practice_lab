import { addBits, toSigned, type Bit, type Bits } from './bits'

export interface ShiftResult {
  bits: Bits
  /** The last bit shifted out of the register (null when nothing moved). */
  out: Bit | null
  /** Every bit that fell out, in the order they left. */
  lost: Bits
  /** Arithmetic left shift only: the signed value is no longer `old × 2^n`. */
  overflow?: boolean
}

const clampCount = (count: number, width: number): number => {
  if (!Number.isInteger(count) || count < 0) throw new RangeError('Shift count must be 0 or more.')
  return Math.min(count, width)
}

const left = (bits: Bits, count: number): ShiftResult => {
  const n = clampCount(count, bits.length)
  const lost = bits.slice(0, n)
  const out = [...bits.slice(n), ...new Array<Bit>(n).fill(0)]
  return { bits: out, out: n === 0 ? null : lost[n - 1]!, lost }
}

const right = (bits: Bits, count: number, fill: Bit): ShiftResult => {
  const n = clampCount(count, bits.length)
  const lost = bits.slice(bits.length - n).reverse()
  const out = [...new Array<Bit>(n).fill(fill), ...bits.slice(0, bits.length - n)]
  return { bits: out, out: n === 0 ? null : lost[n - 1]!, lost }
}

export const shiftLeftLogical = (bits: Bits, count = 1): ShiftResult => left(bits, count)

export const shiftRightLogical = (bits: Bits, count = 1): ShiftResult => right(bits, count, 0)

/** Right shift that copies the sign bit in: halves a two's complement value (rounding down). */
export const shiftRightArithmetic = (bits: Bits, count = 1): ShiftResult =>
  right(bits, count, bits[0]!)

/** Left shift on a signed value; `overflow` is set if the sign (or the value) was lost. */
export const shiftLeftArithmetic = (bits: Bits, count = 1): ShiftResult => {
  const r = left(bits, count)
  const n = clampCount(count, bits.length)
  return { ...r, overflow: toSigned(r.bits) !== toSigned(bits) * 2 ** n }
}

export interface AddResult {
  bits: Bits
  /** Carry INTO each column (aligned with `bits`, MSB first). The last entry is the carry-in. */
  carries: Bits
  /** Unsigned reading: a carry out of the top column means the result did not fit. */
  carryOut: Bit
  /** Signed reading: the result has the wrong sign. */
  overflow: boolean
  /** Why it overflowed (null when it did not). */
  overflowReason: string | null
}

export const add = (a: Bits, b: Bits, carryIn: Bit = 0): AddResult => {
  const { bits, carries, carryOut } = addBits(a, b, carryIn)
  const sa = a[0]!
  const sb = b[0]!
  const sr = bits[0]!
  const overflow = sa === sb && sr !== sa
  const overflowReason = !overflow
    ? null
    : sa === 0
      ? 'two positives gave a negative'
      : 'two negatives gave a positive'
  return { bits, carries, carryOut, overflow, overflowReason }
}
