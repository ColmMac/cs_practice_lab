import type { ParsedAnswer } from '../../core/language'
import { compareValues } from '../../core/study/compare'
import type { Value } from '../../core/types'
import { pyStr } from './format'

// A small `ast.literal_eval` for student answers: numbers, strings, True/False/None, lists, tuples, dicts,
// sets, set()/frozenset(...), inf/nan. It parses UNTRUSTED text, so it is length- and depth-limited and
// never evaluates anything.

export type PyParse = { ok: true; value: Value } | { ok: false; error: string }

const MAX_LENGTH = 2000
const MAX_DEPTH = 40

class ParseError extends Error {}

const NUMBER = /^(?:0[xX][0-9a-fA-F_]+|0[oO][0-7_]+|0[bB][01_]+|\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?\d[\d_]*)?|\.\d[\d_]*(?:[eE][+-]?\d[\d_]*)?)/
const IDENT_START = /[A-Za-z_]/
const IDENT_PART = /[A-Za-z0-9_]/

/** How Python prints a float. */
export function pyFloat(n: number): string {
  if (Number.isNaN(n)) return 'nan'
  if (n === Infinity) return 'inf'
  if (n === -Infinity) return '-inf'
  if (Object.is(n, -0)) return '-0.0'
  return Number.isInteger(n) && Math.abs(n) < 1e16 ? `${n}.0` : String(n)
}

const ESCAPES: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', a: '\x07', b: '\b', f: '\f', v: '\v' }

class Parser {
  private i = 0
  constructor(private readonly s: string) {}

  private fail(msg: string): never {
    throw new ParseError(`${msg} (at position ${this.i + 1})`)
  }
  private peek(): string {
    return this.s.charAt(this.i)
  }
  private ws() {
    while (/\s/.test(this.peek()) && this.i < this.s.length) this.i++
  }
  private eof(): boolean {
    return this.i >= this.s.length
  }
  private expect(ch: string) {
    if (this.peek() !== ch) this.fail(`Expected '${ch}'`)
    this.i++
  }

  parseAll(): Value {
    this.ws()
    if (this.eof()) this.fail('Empty answer')
    const first = this.expr(0)
    this.ws()
    let result = first
    if (this.peek() === ',') {
      // `1, 2` without brackets is a tuple, like literal_eval
      const items = [first]
      while (this.peek() === ',') {
        this.i++
        this.ws()
        if (this.eof()) break
        items.push(this.expr(0))
        this.ws()
      }
      result = { k: 'tuple', items, ref: 0 }
    }
    if (!this.eof()) this.fail(`Unexpected '${this.peek()}'`)
    return result
  }

  private expr(depth: number): Value {
    if (depth >= MAX_DEPTH) this.fail('Nested too deeply') // at most MAX_DEPTH levels of brackets
    this.ws()
    const ch = this.peek()
    if (ch === '[') return this.list(depth)
    if (ch === '(') return this.paren(depth)
    if (ch === '{') return this.brace(depth)
    if (ch === '"' || ch === "'" || this.stringPrefixAt()) return this.strings()
    if (ch === '-' || ch === '+') return this.signed()
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(this.s.charAt(this.i + 1)))) return this.number(false)
    if (IDENT_START.test(ch)) return this.name(depth)
    return this.fail(this.eof() ? 'Unexpected end of answer' : `Unexpected '${ch}'`)
  }

  // ── numbers ──

  private signed(): Value {
    const negative = this.peek() === '-'
    this.i++
    this.ws()
    const ch = this.peek()
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(this.s.charAt(this.i + 1)))) return this.number(negative)
    if (IDENT_START.test(ch)) {
      const id = this.identifier()
      if (id === 'inf') return { k: 'float', v: negative ? '-inf' : 'inf' }
      if (id === 'nan') return { k: 'float', v: 'nan' }
    }
    return this.fail("A sign must be followed by a number")
  }

  private number(negative: boolean): Value {
    const m = NUMBER.exec(this.s.slice(this.i))
    if (!m) this.fail('Expected a number')
    const text = m[0].replaceAll('_', '')
    this.i += m[0].length
    if (IDENT_PART.test(this.peek())) this.fail('A number can’t be followed by letters')

    const radix = /^0[xXoObB]/.test(text)
    if (!radix && /[.eE]/.test(text)) {
      const n = Number(text)
      if (Number.isNaN(n)) this.fail('Not a valid number')
      return { k: 'float', v: pyFloat(negative ? -n : n) }
    }
    if (!radix && /^0\d*[1-9]/.test(text)) this.fail('Python doesn’t allow leading zeros in whole numbers')
    const big = BigInt(text)
    return { k: 'int', v: (negative ? -big : big).toString() }
  }

  // ── names: True / False / None / inf / nan / set(...) / frozenset(...) ──

  private identifier(): string {
    const start = this.i
    while (IDENT_PART.test(this.peek()) && !this.eof()) this.i++
    return this.s.slice(start, this.i)
  }

  private name(depth: number): Value {
    const id = this.identifier()
    switch (id) {
      case 'True':
        return { k: 'bool', v: true }
      case 'False':
        return { k: 'bool', v: false }
      case 'None':
        return { k: 'none' }
      case 'inf':
        return { k: 'float', v: 'inf' }
      case 'nan':
        return { k: 'float', v: 'nan' }
      case 'set':
      case 'frozenset': {
        this.ws()
        this.expect('(')
        this.ws()
        let items: Value[] = []
        if (this.peek() !== ')') {
          const inner = this.expr(depth + 1)
          if (inner.k !== 'list' && inner.k !== 'tuple' && inner.k !== 'set' && inner.k !== 'frozenset') {
            this.fail(`${id}(...) needs a list, tuple or set inside`)
          }
          items = inner.items
          this.ws()
        }
        this.expect(')')
        return { k: id, items: dedupe(items), ref: 0 }
      }
      default:
        return this.fail(`Unknown name '${id}'`)
    }
  }

  // ── containers ──

  private list(depth: number): Value {
    this.expect('[')
    const items: Value[] = []
    for (;;) {
      this.ws()
      if (this.peek() === ']') break
      items.push(this.expr(depth + 1))
      this.ws()
      if (this.peek() === ',') this.i++
      else break
    }
    this.ws()
    this.expect(']')
    return { k: 'list', items, ref: 0 }
  }

  private paren(depth: number): Value {
    this.expect('(')
    this.ws()
    if (this.peek() === ')') {
      this.i++
      return { k: 'tuple', items: [], ref: 0 }
    }
    const first = this.expr(depth + 1)
    this.ws()
    if (this.peek() === ')') {
      this.i++
      return first // plain grouping: (5) is 5
    }
    if (this.peek() !== ',') this.fail("Expected ',' or ')'")
    const items = [first]
    while (this.peek() === ',') {
      this.i++
      this.ws()
      if (this.peek() === ')') break
      items.push(this.expr(depth + 1))
      this.ws()
    }
    this.expect(')')
    return { k: 'tuple', items, ref: 0 }
  }

  private brace(depth: number): Value {
    this.expect('{')
    this.ws()
    if (this.peek() === '}') {
      this.i++
      return { k: 'dict', entries: [], ref: 0 }
    }
    const first = this.expr(depth + 1)
    this.ws()
    if (this.peek() === ':') {
      const entries: [Value, Value][] = []
      let key = first
      for (;;) {
        this.expect(':')
        const value = this.expr(depth + 1)
        const at = entries.findIndex(([k]) => compareValues(k, key).kind === 'equal')
        if (at >= 0) entries[at] = [entries[at]![0], value]
        else entries.push([key, value])
        this.ws()
        if (this.peek() !== ',') break
        this.i++
        this.ws()
        if (this.peek() === '}') break
        key = this.expr(depth + 1)
        this.ws()
      }
      this.ws()
      this.expect('}')
      return { k: 'dict', entries, ref: 0 }
    }
    const items = [first]
    while (this.peek() === ',') {
      this.i++
      this.ws()
      if (this.peek() === '}') break
      items.push(this.expr(depth + 1))
      this.ws()
    }
    this.expect('}')
    return { k: 'set', items: dedupe(items), ref: 0 }
  }

  // ── strings ──

  private stringPrefixAt(): boolean {
    const m = /^([rRuU])(['"])/.exec(this.s.slice(this.i, this.i + 2))
    return m !== null
  }

  /** One or more adjacent literals ('a' "b" → 'ab'), like Python. */
  private strings(): Value {
    let out = ''
    for (;;) {
      out += this.oneString()
      const save = this.i
      this.ws()
      const ch = this.peek()
      if (ch === '"' || ch === "'" || this.stringPrefixAt()) continue
      this.i = save
      break
    }
    return { k: 'str', v: out }
  }

  private oneString(): string {
    let raw = false
    const prefix = this.peek()
    if (prefix === 'r' || prefix === 'R') {
      raw = true
      this.i++
    } else if (prefix === 'u' || prefix === 'U') this.i++
    const quote = this.peek()
    if (quote !== '"' && quote !== "'") this.fail('Expected a quote')
    const triple = this.s.startsWith(quote.repeat(3), this.i)
    const close = triple ? quote.repeat(3) : quote
    this.i += close.length

    let out = ''
    for (;;) {
      if (this.eof()) this.fail('This string is missing its closing quote')
      if (this.s.startsWith(close, this.i)) {
        this.i += close.length
        return out
      }
      const ch = this.peek()
      if (ch === '\n' && !triple) this.fail('This string is missing its closing quote')
      if (ch === '\\' && !raw) {
        out += this.escape()
        continue
      }
      out += ch
      this.i++
    }
  }

  private escape(): string {
    this.i++ // the backslash
    const ch = this.peek()
    if (this.eof()) this.fail('Unfinished escape')
    this.i++
    if (ch in ESCAPES) return ESCAPES[ch]!
    if (ch === '\n') return '' // line continuation
    if (ch === 'x') return this.hex(2)
    if (ch === 'u') return this.hex(4)
    if (ch === 'U') return this.hex(8)
    if (/[0-7]/.test(ch)) {
      let digits = ch
      while (digits.length < 3 && /[0-7]/.test(this.peek())) digits += this.s.charAt(this.i++)
      return String.fromCodePoint(parseInt(digits, 8))
    }
    return `\\${ch}` // unknown escapes keep the backslash, like Python
  }

  private hex(n: number): string {
    const digits = this.s.slice(this.i, this.i + n)
    if (digits.length !== n || !/^[0-9a-fA-F]+$/.test(digits)) this.fail('Bad escape sequence')
    this.i += n
    const code = parseInt(digits, 16)
    if (code > 0x10ffff) this.fail('Bad escape sequence')
    return String.fromCodePoint(code)
  }
}

function dedupe(items: Value[]): Value[] {
  const out: Value[] = []
  for (const v of items) if (!out.some((o) => compareValues(o, v).kind === 'equal')) out.push(v)
  return out
}

/** Parses a Python literal. Never throws, never evaluates. */
export function parsePythonValue(text: string): PyParse {
  if (text.length > MAX_LENGTH) return { ok: false, error: 'Answer is too long' }
  try {
    return { ok: true, value: new Parser(text).parseAll() }
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, error: e.message }
    return { ok: false, error: 'Could not read this as a Python value' } // e.g. stack overflow on hostile nesting
  }
}

/** `LanguageDescriptor.parseAnswer` for Python. */
export function parsePythonAnswer(text: string): ParsedAnswer {
  const r = parsePythonValue(text)
  return r.ok ? { ok: true, value: r.value } : { ok: false, raw: text }
}

/**
 * Forms that aren't valid Python but clearly mean something: `hi` for 'hi', `true`, `none`. Used only when the
 * strict parse fails, and the result is always graded "close" with the slip named, never "correct".
 */
export function looseParsePython(text: string): { value: Value; slip: string } | null {
  const t = text.trim()
  const lower = t.toLowerCase()
  if (lower === 'true' || lower === 'false') {
    const word = lower === 'true' ? 'True' : 'False'
    return { value: { k: 'bool', v: lower === 'true' }, slip: `Python writes it ${word}, with a capital first letter.` }
  }
  if (lower === 'none' || lower === 'null' || lower === 'nil') {
    return { value: { k: 'none' }, slip: 'In Python this is written None, with a capital N.' }
  }
  // words with no quotes or brackets, not starting like a number
  if (/^[^\s'"[\](){}:,\\]+(?: [^\s'"[\](){}:,\\]+)*$/.test(t) && !/^[-+]?[\d.]/.test(t)) {
    return { value: { k: 'str', v: t }, slip: `Strings need quotes: write ${pyStr(t)}.` }
  }
  return null
}
