/**
 * Practice questions for number systems (N3.4). Pure and seeded: the same seed gives the same questions.
 * Questions are 8-bit, the width the exam papers use.
 */
import { mulberry32 } from '../study/rng'
import type { Grade } from '../study/types'
import { add } from './arith'
import {
  bitWeight,
  fromSigned,
  fromUnsigned,
  invert,
  toBinary,
  toHex,
  toSigned,
  toUnsigned,
  type Bits,
} from './bits'
import { parseNumberInput } from './parse'

export const PRACTICE_WIDTH = 8 as const

export type QuestionKind = 'dec2bin' | 'bin2dec' | 'bin2hex' | 'hex2bin' | 'neg2twos' | 'twos2dec' | 'add' | 'overflow'

/** How the answer is typed (and so how it is read). */
export type AnswerType = 'bin' | 'hex' | 'unsigned' | 'signed' | 'yesno'

export interface Question {
  id: string
  kind: QuestionKind
  prompt: string
  answerType: AnswerType
  /** The ground truth, canonical text. Used only for grading and the reveal. */
  truth: string
  /** The register(s) the working is drawn from. */
  bits: Bits
  other?: Bits
}

export const KINDS: readonly QuestionKind[] = ['dec2bin', 'bin2dec', 'bin2hex', 'hex2bin', 'neg2twos', 'twos2dec', 'add', 'overflow']

export const QUESTION_COUNT = 8

const pick = (rng: () => number, min: number, max: number): number => min + Math.floor(rng() * (max - min + 1))

const ones = (bits: Bits): number => bits.filter((b) => b === 1).length

/** At least two 1s and two 0s: rules out 0, 1, single place values (64) and their near-opposites (255). */
const mixed = (v: number): boolean => {
  const n = ones(fromUnsigned(v, 8))
  return n >= 2 && n <= 6
}

/** The first draw that is accepted. Every rule here accepts a large share of its range, so this ends quickly. */
function draw<T>(next: () => T, accept: (v: T) => boolean): T {
  for (let i = 0; i < 1000; i++) {
    const v = next()
    if (accept(v)) return v
  }
  throw new Error('practice: no acceptable question values')
}

const mixedValue = (rng: () => number, min: number, max: number): number => draw(() => pick(rng, min, max), mixed)

/** Columns that carried (including a carry out of the top). */
const carryCount = (a: Bits, b: Bits): number => {
  const r = add(a, b)
  return ones(r.carries) + r.carryOut
}

/** Two registers that need at least two carries, with a result that is not 0 or 1. */
function additionPair(rng: () => number): [Bits, Bits] {
  return draw(
    (): [Bits, Bits] => [fromUnsigned(mixedValue(rng, 20, 200), 8), fromUnsigned(mixedValue(rng, 20, 200), 8)],
    ([a, b]) => carryCount(a, b) >= 2 && toUnsigned(add(a, b).bits) > 1,
  )
}

/**
 * A signed pair whose sum does (or does not) overflow, so both answers come up in a session. At least one value is
 * always negative or the sum crosses 127: two small positives would read the same as unsigned binary.
 */
function overflowPair(rng: () => number, wantOverflow: boolean): [Bits, Bits] {
  const [a, b] = draw(
    (): [number, number] => [pick(rng, -128, 127), pick(rng, -128, 127)],
    ([a, b]) => {
      const sum = a + b
      const over = sum < -128 || sum > 127
      if (over !== wantOverflow || Math.abs(a) < 3 || Math.abs(b) < 3) return false
      if (!over && a > 0 && b > 0) return false
      return toUnsigned(add(fromSigned(a, 8), fromSigned(b, 8)).bits) > 1
    },
  )
  return [fromSigned(a, 8), fromSigned(b, 8)]
}

function make(kind: QuestionKind, n: number, rng: () => number): Question {
  const id = `q${n}`
  switch (kind) {
    case 'dec2bin': {
      const v = mixedValue(rng, 3, 255)
      return { id, kind, answerType: 'bin', prompt: `Convert ${v} to 8-bit binary.`, truth: toBinary(fromUnsigned(v, 8)), bits: fromUnsigned(v, 8) }
    }
    case 'bin2dec': {
      const bits = fromUnsigned(mixedValue(rng, 3, 255), 8)
      return { id, kind, answerType: 'unsigned', prompt: `Convert ${toBinary(bits)} to denary (unsigned).`, truth: String(toUnsigned(bits)), bits }
    }
    case 'bin2hex': {
      const bits = fromUnsigned(mixedValue(rng, 16, 255), 8)
      return { id, kind, answerType: 'hex', prompt: `Convert ${toBinary(bits)} to hexadecimal.`, truth: toHex(bits), bits }
    }
    case 'hex2bin': {
      const bits = fromUnsigned(mixedValue(rng, 16, 255), 8)
      return { id, kind, answerType: 'bin', prompt: `Convert hex ${toHex(bits)} to 8-bit binary.`, truth: toBinary(bits), bits }
    }
    case 'neg2twos': {
      const v = -mixedValue(rng, 3, 127)
      const bits = fromSigned(v, 8)
      return { id, kind, answerType: 'bin', prompt: `Write ${v} in 8-bit two’s complement.`, truth: toBinary(bits), bits }
    }
    case 'twos2dec': {
      const bits = fromUnsigned(mixedValue(rng, 129, 255), 8) // sign bit set, so it is negative
      return { id, kind, answerType: 'signed', prompt: `${toBinary(bits)} is an 8-bit two’s complement number. What is its denary value?`, truth: String(toSigned(bits)), bits }
    }
    case 'add': {
      const [a, b] = additionPair(rng)
      const sum = add(a, b)
      return {
        id,
        kind,
        answerType: 'bin',
        prompt: `Add ${toBinary(a)} and ${toBinary(b)} in an 8-bit register. Give the 8-bit result (ignore any carry out).`,
        truth: toBinary(sum.bits),
        bits: a,
        other: b,
      }
    }
    case 'overflow': {
      const [a, b] = overflowPair(rng, rng() < 0.5)
      return {
        id,
        kind,
        answerType: 'yesno',
        prompt: `${toBinary(a)} + ${toBinary(b)} as 8-bit two’s complement numbers. Has overflow occurred? (yes or no)`,
        truth: add(a, b).overflow ? 'yes' : 'no',
        bits: a,
        other: b,
      }
    }
  }
}

/** `count` questions cycling through `kinds` (default: all of them), numbers drawn from the seed. */
export function generateQuestions(seed: number, count = QUESTION_COUNT, kinds: readonly QuestionKind[] = KINDS): Question[] {
  const rng = mulberry32(seed)
  return Array.from({ length: count }, (_, i) => make(kinds[i % kinds.length]!, i, rng))
}

const YES = new Set(['y', 'yes', 'true', 't'])
const NO = new Set(['n', 'no', 'false', 'f'])

/**
 * Grades one typed answer, tolerant of formatting (`0b`, spaces, `0x`, `h`, leading zeros in hex and denary).
 * Right binary with leading zeros missing is "Almost". Messages never contain the answer.
 */
export function gradeAnswer(q: Question, text: string): Grade {
  if (q.answerType === 'yesno') {
    const w = text.trim().toLowerCase()
    if (!YES.has(w) && !NO.has(w)) return { state: 'incorrect', message: 'Answer yes or no.' }
    return { state: YES.has(w) === (q.truth === 'yes') ? 'correct' : 'incorrect' }
  }
  const parsed = parseNumberInput(text, q.answerType, PRACTICE_WIDTH)
  if (!parsed.ok) return { state: 'incorrect', message: parsed.message }
  const given = toBinary(parsed.bits)
  const truthBits = parseNumberInput(q.truth, q.answerType, PRACTICE_WIDTH)
  if (!truthBits.ok || given !== toBinary(truthBits.bits)) return { state: 'incorrect', message: 'That is not the right value.' }
  if (q.answerType === 'bin' && parsed.padded) return { state: 'close', message: 'Right value: write all 8 bits.' }
  return { state: 'correct' }
}

/** A nudge that never gives the answer away. */
export function hintFor(q: Question): string {
  switch (q.kind) {
    case 'dec2bin':
      return 'Bit weights from the left: 128, 64, 32, 16, 8, 4, 2, 1. Take away the biggest one that fits.'
    case 'bin2dec':
      return 'Add up the weights (128, 64, 32, 16, 8, 4, 2, 1) of the bits that are 1.'
    case 'bin2hex':
      return 'Split into two groups of four bits; each group is one hex digit (0-9, A-F).'
    case 'hex2bin':
      return 'Turn each hex digit into four bits.'
    case 'neg2twos':
      return 'Write the positive number in binary, invert every bit, then add 1.'
    case 'twos2dec':
      return 'The top bit has weight -128. Add the other weights of the 1 bits to it.'
    case 'add':
      return 'Add column by column from the right, carrying 1 when a column adds to 2 or more.'
    case 'overflow':
      return 'Look at the signs: two positives or two negatives should not give the opposite sign.'
  }
}

const weightsRow = (): string => Array.from({ length: 8 }, (_, i) => String(bitWeight(i, 8)).padStart(3)).join(' ')
const bitsRow = (bits: Bits): string => bits.map((b) => String(b).padStart(3)).join(' ')

const sumOfSet = (bits: Bits, signed: boolean): string => {
  const parts = bits.flatMap((b, i) => (b === 1 ? [signed && i === 0 ? -bitWeight(0, 8) : bitWeight(i, 8)] : []))
  const total = parts.reduce((s, n) => s + n, 0)
  if (parts.length === 0) return '0'
  return `${parts.map((p, i) => (i === 0 ? String(p) : p < 0 ? `- ${-p}` : `+ ${p}`)).join(' ')} = ${total}`
}

/** The step-by-step working for a question (shown once it has been checked or revealed). */
export function explain(q: Question): string[] {
  const table = ['weight ' + weightsRow(), 'bit    ' + bitsRow(q.bits)]
  switch (q.kind) {
    case 'dec2bin':
    case 'bin2dec':
      return [...table, `Set weights: ${sumOfSet(q.bits, false)}`, `Binary: ${toBinary(q.bits)}`]
    case 'bin2hex':
    case 'hex2bin': {
      const hi = toBinary(q.bits.slice(0, 4))
      const lo = toBinary(q.bits.slice(4))
      const t = toHex(q.bits)
      return [`${hi}  ${lo}`, `${t[0]}     ${t[1]}   (each group of four bits is one hex digit)`, `Hex ${t} = binary ${toBinary(q.bits)}`]
    }
    case 'neg2twos': {
      const pos = negateBits(q.bits)
      return [
        `Positive value in binary: ${toBinary(pos)}`,
        `Invert every bit:         ${toBinary(invert(pos))}`,
        `Add 1:                    ${toBinary(q.bits)}`,
      ]
    }
    case 'twos2dec':
      return [...table, `With the top bit worth -128: ${sumOfSet(q.bits, true)}`]
    case 'add':
    case 'overflow': {
      const r = add(q.bits, q.other!)
      const lines = [
        `carry   ${r.carries.map((c) => String(c).padStart(1)).join('')}`,
        `        ${toBinary(q.bits)}`,
        `      + ${toBinary(q.other!)}`,
        `      = ${toBinary(r.bits)}${r.carryOut ? '  (carry out of the top column, dropped)' : ''}`,
      ]
      if (q.kind === 'overflow') {
        lines.push(r.overflow ? `Overflow: ${r.overflowReason}.` : 'No overflow: the sign of the result is right.')
      }
      return lines
    }
  }
}

/** The positive magnitude register of a negative two's complement value (invert, add 1). */
function negateBits(bits: Bits): Bits {
  return fromUnsigned(-toSigned(bits), 8)
}
