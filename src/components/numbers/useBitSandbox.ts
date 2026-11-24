import { useState } from 'react'
import {
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
  type Bit,
  type Bits,
  type NumberBase,
  type ShiftResult,
  type Width,
} from '../../core/numbers'

export type ShiftKind = 'lsl' | 'lsr' | 'asl' | 'asr'
export type View = 'unsigned' | 'signed'

export const SHIFTS: Record<ShiftKind, { label: string; run: (b: Bits) => ShiftResult }> = {
  lsl: { label: 'Logical left', run: (b) => shiftLeftLogical(b) },
  lsr: { label: 'Logical right', run: (b) => shiftRightLogical(b) },
  asl: { label: 'Arithmetic left', run: (b) => shiftLeftArithmetic(b) },
  asr: { label: 'Arithmetic right', run: (b) => shiftRightArithmetic(b) },
}

/** What the last button press did, so the page can explain it (the bit that fell out, "invert + 1"). */
export type Note =
  | { kind: 'shift'; shift: ShiftKind; out: Bit | null; overflow: boolean | undefined }
  | { kind: 'negate'; before: Bits; inverted: Bits }
  | { kind: 'invert' }
  | null

export const FIELDS: { base: NumberBase; label: string; hint: string }[] = [
  { base: 'unsigned', label: 'Denary (unsigned)', hint: '0 to 2^n - 1' },
  { base: 'signed', label: 'Denary (signed)', hint: 'two’s complement' },
  { base: 'bin', label: 'Binary', hint: '0b and spaces are fine' },
  { base: 'hex', label: 'Hex', hint: '0x, & or h are fine' },
]

const show = (bits: Bits, base: NumberBase): string =>
  base === 'unsigned'
    ? String(toUnsigned(bits))
    : base === 'signed'
      ? String(toSigned(bits))
      : base === 'bin'
        ? toBinary(bits)
        : toHex(bits)

const zeros = (width: Width): Bits => fromUnsigned(0, width)

export function useBitSandbox() {
  const [width, setWidthState] = useState<Width>(8)
  const [bits, setBits] = useState<Bits>(() => zeros(8))
  const [view, setView] = useState<View>('unsigned')
  const [note, setNote] = useState<Note>(null)
  // The text a student is typing in a field, kept apart from the bits so a half-typed value never clobbers them.
  const [drafts, setDrafts] = useState<Partial<Record<NumberBase, string>>>({})
  const [errors, setErrors] = useState<Partial<Record<NumberBase, string>>>({})

  const settle = (next: Bits, n: Note = null) => {
    setBits(next)
    setNote(n)
    setDrafts({})
    setErrors({})
  }

  const toggle = (index: number) => settle(bits.map((b, i) => (i === index ? ((1 - b) as Bit) : b)))

  /** Widening zero-extends; narrowing keeps the low bits. */
  const setWidth = (w: Width) => {
    if (w === width) return
    setWidthState(w)
    setBits((old) => (w > old.length ? [...zeros(w).slice(0, w - old.length), ...old] : old.slice(old.length - w)))
    setNote(null)
    setDrafts({})
    setErrors({})
  }

  const edit = (base: NumberBase, text: string) => {
    setDrafts({ [base]: text })
    const r = parseNumberInput(text, base, width)
    if (r.ok) {
      setBits(r.bits)
      setErrors({})
      setNote(null)
    } else {
      setErrors({ [base]: r.message })
    }
  }

  const endEdit = () => {
    setDrafts({})
    setErrors({})
  }

  const shift = (kind: ShiftKind) => {
    const r = SHIFTS[kind].run(bits)
    settle(r.bits, { kind: 'shift', shift: kind, out: r.out, overflow: r.overflow })
  }

  const values = Object.fromEntries(FIELDS.map((f) => [f.base, drafts[f.base] ?? show(bits, f.base)])) as Record<
    NumberBase,
    string
  >

  return {
    width,
    bits,
    view,
    note,
    errors,
    values,
    setView,
    setWidth,
    toggle,
    edit,
    endEdit,
    shift,
    clear: () => settle(zeros(width)),
    invert: () => settle(invert(bits), { kind: 'invert' }),
    negate: () => settle(negate(bits), { kind: 'negate', before: bits, inverted: invert(bits) }),
  }
}

/** "64 + 8 + 1 = 73": the weights of the set bits (the top weight is negative in the signed view). */
export function sumLine(bits: Bits, view: View): string {
  const n = bits.length
  const terms: number[] = []
  bits.forEach((b, i) => {
    if (b === 1) terms.push(i === 0 && view === 'signed' ? -(2 ** (n - 1)) : 2 ** (n - 1 - i))
  })
  const total = view === 'signed' ? toSigned(bits) : toUnsigned(bits)
  if (terms.length === 0) return `No bits set = ${total}`
  return `${terms.map((t, i) => (i === 0 ? String(t) : t < 0 ? `- ${-t}` : `+ ${t}`)).join(' ')} = ${total}`
}
