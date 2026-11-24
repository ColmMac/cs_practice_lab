import { describe, expect, it } from 'vitest'
import {
  type Bits,
  add,
  explain,
  fromSigned,
  generateQuestions,
  gradeAnswer,
  hintFor,
  KINDS,
  toBinary,
  toSigned,
  toUnsigned,
  type Question,
} from '../../src/core/numbers'

const q = (kind: Question['kind'], answerType: Question['answerType'], truth: string, bits: Bits = [0, 1, 0, 0, 1, 0, 0, 1]): Question => ({
  id: 'q0',
  kind,
  answerType,
  truth,
  prompt: '',
  bits,
})

describe('generateQuestions', () => {
  it('is deterministic for a seed and differs between seeds', () => {
    expect(generateQuestions(7)).toEqual(generateQuestions(7))
    expect(generateQuestions(7).map((x) => x.prompt)).not.toEqual(generateQuestions(8).map((x) => x.prompt))
  })

  it('covers every kind once in eight questions', () => {
    expect(generateQuestions(1).map((x) => x.kind)).toEqual([...KINDS])
  })

  it('has a truth that agrees with the registers, over many seeds', () => {
    for (let seed = 0; seed < 300; seed++) {
      for (const x of generateQuestions(seed, 16)) {
        if (x.kind === 'dec2bin' || x.kind === 'hex2bin') expect(x.truth).toBe(toBinary(x.bits))
        if (x.kind === 'bin2dec') expect(x.truth).toBe(String(toUnsigned(x.bits)))
        if (x.kind === 'twos2dec') {
          expect(x.truth).toBe(String(toSigned(x.bits)))
          expect(toSigned(x.bits)).toBeLessThan(0)
        }
        if (x.kind === 'neg2twos') expect(x.prompt).toContain(String(toSigned(x.bits)))
        if (x.kind === 'add') expect(x.truth).toBe(toBinary(add(x.bits, x.other!).bits))
        if (x.kind === 'overflow') expect(x.truth).toBe(add(x.bits, x.other!).overflow ? 'yes' : 'no')
      }
    }
  })

  it('asks for both yes and no overflow answers', () => {
    const answers = new Set<string>()
    for (let seed = 0; seed < 40; seed++) generateQuestions(seed, 16).forEach((x) => x.kind === 'overflow' && answers.add(x.truth))
    expect(answers).toEqual(new Set(['yes', 'no']))
  })

  it('hand-checked: a negative becomes its two’s complement', () => {
    // -5: 00000101 -> invert 11111010 -> +1 = 11111011
    const x = { ...q('neg2twos', 'bin', '11111011', fromSigned(-5, 8)) }
    expect(gradeAnswer(x, '11111011').state).toBe('correct')
    expect(explain(x)).toEqual([
      'Positive value in binary: 00000101',
      'Invert every bit:         11111010',
      'Add 1:                    11111011',
    ])
  })
})

describe('gradeAnswer', () => {
  const bin = q('dec2bin', 'bin', '01001001')
  it('accepts formatting variations', () => {
    for (const t of ['01001001', '0b01001001', '0100 1001', '0100_1001', '%01001001', '01001001b']) {
      expect(gradeAnswer(bin, t).state, t).toBe('correct')
    }
  })
  it('gives Almost for missing leading zeros, without the answer', () => {
    const g = gradeAnswer(bin, '1001001')
    expect(g.state).toBe('close')
    expect(g.message).toMatch(/all 8 bits/)
    expect(g.message).not.toContain('01001001')
  })
  it('marks a wrong or malformed value wrong without revealing the truth', () => {
    for (const t of ['01001000', '12', '', '110010010']) {
      const g = gradeAnswer(bin, t)
      expect(g.state, t).toBe('incorrect')
      expect(g.message ?? '').not.toContain('01001001')
    }
  })
  it('reads hex, unsigned and signed denary, and yes/no', () => {
    const hex = q('bin2hex', 'hex', '49')
    expect(gradeAnswer(hex, '0x49').state).toBe('correct')
    expect(gradeAnswer(hex, '49h').state).toBe('correct')
    expect(gradeAnswer(hex, '94').state).toBe('incorrect')
    expect(gradeAnswer(q('bin2dec', 'unsigned', '73'), ' 073 ').state).toBe('correct')
    expect(gradeAnswer(q('twos2dec', 'signed', '-127'), '-127').state).toBe('correct')
    expect(gradeAnswer(q('twos2dec', 'signed', '-127'), '129').state).toBe('incorrect')
    const yn = q('overflow', 'yesno', 'yes')
    expect(gradeAnswer(yn, 'Yes').state).toBe('correct')
    expect(gradeAnswer(yn, 'n').state).toBe('incorrect')
    expect(gradeAnswer(yn, 'maybe').state).toBe('incorrect')
  })
})

describe('working and hints', () => {
  it('shows the bit-weight table for a conversion', () => {
    const lines = explain(q('dec2bin', 'bin', '01001001'))
    expect(lines.join('\n')).toContain('64 + 8 + 1 = 73')
  })
  it('shows the negative top weight for two’s complement to denary', () => {
    const x = q('twos2dec', 'signed', '-127', [1, 0, 0, 0, 0, 0, 0, 1])
    expect(explain(x).join('\n')).toContain('-128 + 1 = -127')
  })
  it('hints never contain the answer', () => {
    for (const x of generateQuestions(3)) if (x.answerType === 'bin') expect(hintFor(x)).not.toContain(x.truth)
  })
})
