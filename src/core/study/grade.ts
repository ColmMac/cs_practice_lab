import type { ParsedAnswer } from '../language'
import type { Value } from '../types'
import { compareValues } from './compare'
import type { Grade, Truth } from './types'

/** The slice of a language descriptor that grading needs. */
export interface GradingLanguage {
  formatValue(v: Value): string
  parseAnswer(text: string): ParsedAnswer
  /** Sloppy-but-recognisable forms (unquoted words, `true`, `none`) → the value they mean + the slip to point out. */
  looseParse?(text: string): { value: Value; slip: string } | null
}

/**
 * Trim, unify line endings, and collapse runs of spaces/tabs, except inside quotes (where they are the answer).
 * Used when an answer can't be parsed as a value and has to be compared as text.
 */
export function normalizeAnswer(text: string): string {
  const s = text.replace(/\r\n?/g, '\n').trim()
  let out = ''
  let quote: string | null = null
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!
    if (quote) {
      out += ch
      if (ch === '\\' && i + 1 < s.length) out += s[++i]!
      else if (ch === quote) quote = null
    } else if (ch === '"' || ch === "'") {
      quote = ch
      out += ch
    } else if (ch === ' ' || ch === '\t') {
      if (!out.endsWith(' ')) out += ' '
    } else out += ch
  }
  return out
}

const BLANK_LINE_MARK = '⏎'

/** Lines of printed output: trailing whitespace trimmed, trailing blank lines dropped, ⏎ means a blank line. */
export function outputLines(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, '').replaceAll(BLANK_LINE_MARK, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

const sameLines = (a: string[], b: string[]) => a.length === b.length && a.every((l, i) => l === b[i])
const squash = (lines: string[]) => lines.map((l) => l.toLowerCase().replace(/\s+/g, ' ').trim())

function gradeOutput(answer: string, truth: string): Grade {
  const want = outputLines(truth)
  // The cell is a single line, so a student writes \n between lines. Accept a real newline too.
  const typed = [outputLines(answer), outputLines(answer.replaceAll('\\n', '\n'))]
  if (typed.some((t) => sameLines(t, want))) return { state: 'correct' }
  if (typed.some((t) => sameLines(squash(t), squash(want)))) {
    return { state: 'close', message: 'Right text, but output has to match exactly, including capital letters and spaces.' }
  }
  return { state: 'incorrect' }
}

/** Grades one answer against the ground truth. Never reveals the truth in `message`. */
export function gradeAnswer(text: string, truth: Truth, lang: GradingLanguage): Grade {
  if (text.trim() === '') return { state: 'incorrect', message: 'No answer entered.' }
  if (truth.kind === 'output') return gradeOutput(text, truth.text)

  const want = truth.value
  // Objects and other reprs can't be typed as a literal: compare the text.
  if (want.k === 'object' || want.k === 'opaque') {
    return normalizeAnswer(text) === normalizeAnswer(lang.formatValue(want))
      ? { state: 'correct' }
      : { state: 'incorrect' }
  }

  const parsed = lang.parseAnswer(text)
  if (parsed.ok) {
    const m = compareValues(parsed.value, want)
    if (m.kind === 'equal') return { state: 'correct' }
    if (m.kind === 'close') return { state: 'close', message: m.why }
    return { state: 'incorrect' }
  }

  const loose = lang.looseParse?.(text)
  if (loose) {
    const m = compareValues(loose.value, want)
    if (m.kind === 'equal') return { state: 'close', message: loose.slip }
    if (m.kind === 'close') return { state: 'close', message: `${loose.slip} ${m.why}` }
    return { state: 'incorrect' }
  }
  return { state: 'incorrect', message: 'Couldn’t read this as a value — check brackets and quotes.' }
}
