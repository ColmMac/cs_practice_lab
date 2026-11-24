import { useState } from 'react'
import {
  add,
  fromUnsigned,
  parseNumberInput,
  toBinary,
  toSigned,
  toUnsigned,
  type AddResult,
  type Bit,
  type Bits,
  type Width,
} from '../../core/numbers'

export type Operand = 'a' | 'b'

/** Zero-extend or keep the low bits, so an operand always matches the register width. */
const fit = (bits: Bits, width: Width): Bits =>
  bits.length === width
    ? bits
    : bits.length < width
      ? [...fromUnsigned(0, width).slice(0, width - bits.length), ...bits]
      : bits.slice(bits.length - width)

export interface ColumnWork {
  /** Index into the bits array (0 = most significant). */
  index: number
  /** Weight position, 0 = rightmost. */
  position: number
  a: Bit
  b: Bit
  carryIn: Bit
  sum: number
  write: Bit
  carryOut: Bit
}

/** The working for one column: a + b + carry in = sum, so write `sum mod 2` and carry `sum div 2`. */
export function columnWork(a: Bits, b: Bits, result: AddResult, index: number): ColumnWork {
  const n = a.length
  const carryIn = result.carries[index]!
  const sum = a[index]! + b[index]! + carryIn
  return {
    index,
    position: n - 1 - index,
    a: a[index]!,
    b: b[index]!,
    carryIn,
    sum,
    write: (sum % 2) as Bit,
    carryOut: (sum >= 2 ? 1 : 0) as Bit,
  }
}

export const describeColumn = (w: ColumnWork): string =>
  `Column ${w.position}: ${w.a} + ${w.b} + carry ${w.carryIn} = ${w.sum}, so write ${w.write} and carry ${w.carryOut}.`

export function useAddition(width: Width, initial?: { a: Bits | null; b: Bits | null }) {
  const [rawA, setRawA] = useState<Bits>(() => initial?.a ?? fromUnsigned(0, 8))
  const [rawB, setRawB] = useState<Bits>(() => initial?.b ?? fromUnsigned(0, 8))
  /** Columns revealed so far (counted from the right); null means everything is shown. */
  const [step, setStep] = useState<number | null>(null)
  const [drafts, setDrafts] = useState<Partial<Record<Operand, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<Operand, string>>>({})

  const a = fit(rawA, width)
  const b = fit(rawB, width)
  const result = add(a, b)
  const revealed = step === null ? width : Math.min(step, width)

  const set = (which: Operand, bits: Bits) => (which === 'a' ? setRawA(bits) : setRawB(bits))
  const changed = () => {
    setStep(null)
    setDrafts({})
    setErrors({})
  }

  return {
    a,
    b,
    result,
    revealed,
    done: revealed === width,
    errors,
    unsigned: {
      a: toUnsigned(a),
      b: toUnsigned(b),
      sum: toUnsigned(a) + toUnsigned(b),
      shown: toUnsigned(result.bits),
    },
    signed: { a: toSigned(a), b: toSigned(b), sum: toSigned(a) + toSigned(b), shown: toSigned(result.bits) },
    /** The column most recently revealed (null before the first step). */
    last: revealed > 0 ? columnWork(a, b, result, width - revealed) : null,
    toggle: (which: Operand, index: number) => {
      const bits = which === 'a' ? a : b
      set(
        which,
        bits.map((x, i) => (i === index ? ((1 - x) as Bit) : x)),
      )
      changed()
    },
    edit: (which: Operand, text: string) => {
      setDrafts({ [which]: text })
      const r = parseNumberInput(text, 'bin', width)
      if (r.ok) {
        set(which, r.bits)
        setErrors({})
        setStep(null)
      } else {
        setErrors({ [which]: r.message })
      }
    },
    endEdit: () => {
      setDrafts({})
      setErrors({})
    },
    text: (which: Operand) => drafts[which] ?? toBinary(which === 'a' ? a : b),
    load: (x: number, y: number) => {
      setRawA(fromUnsigned(x, width))
      setRawB(fromUnsigned(y, width))
      changed()
    },
    clear: () => {
      setRawA(fromUnsigned(0, width))
      setRawB(fromUnsigned(0, width))
      changed()
    },
    restart: () => setStep(0),
    next: () => setStep(Math.min(width, revealed + 1)),
    prev: () => setStep(Math.max(0, revealed - 1)),
    showAll: () => setStep(null),
  }
}
