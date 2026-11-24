import { LogicError, type BinOp } from './ast'

export type Token =
  | { kind: 'var'; name: string; pos: number; len: number }
  | { kind: 'const'; value: boolean; pos: number; len: number }
  | { kind: 'not'; pos: number; len: number }
  | { kind: 'bin'; op: BinOp; pos: number; len: number }
  | { kind: 'lparen' | 'rparen' | 'sep' | 'eq' | 'end'; pos: number; len: number }
  | { kind: 'ident'; name: string; pos: number; len: number }

const WORDS: Record<string, Token['kind'] | BinOp | 'TRUE' | 'FALSE'> = {
  NOT: 'not',
  AND: 'AND',
  NAND: 'NAND',
  XOR: 'XOR',
  OR: 'OR',
  NOR: 'NOR',
  TRUE: 'TRUE',
  FALSE: 'FALSE',
}

/** Symbol spellings, longest first so `&&` wins over `&` and `||` over `|`. */
const SYMBOLS: [string, Token['kind'] | BinOp][] = [
  ['&&', 'AND'],
  ['||', 'OR'],
  ['!', 'not'],
  ['~', 'not'],
  ['¬', 'not'],
  ['&', 'AND'],
  ['·', 'AND'],
  ['∧', 'AND'],
  ['^', 'XOR'],
  ['⊕', 'XOR'],
  ['|', 'OR'],
  ['+', 'OR'],
  ['∨', 'OR'],
  ['(', 'lparen'],
  [')', 'rparen'],
  [';', 'sep'],
  ['\n', 'sep'],
  ['=', 'eq'],
]

const isLetter = (c: string) => /[A-Za-z_]/.test(c)
const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c)

/** Turn source text into tokens (always ending with an `end` token). Throws LogicError. */
export function tokenize(src: string): Token[] {
  const out: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]!
    if (c === ' ' || c === '\t' || c === '\r') {
      i++
      continue
    }
    if (isLetter(c)) {
      let j = i + 1
      while (j < src.length && isWordChar(src[j]!)) j++
      const text = src.slice(i, j)
      const up = text.toUpperCase()
      const word = WORDS[up]
      const len = j - i
      if (word === 'TRUE' || word === 'FALSE') out.push({ kind: 'const', value: word === 'TRUE', pos: i, len })
      else if (word === 'not') out.push({ kind: 'not', pos: i, len })
      else if (word) out.push({ kind: 'bin', op: word as BinOp, pos: i, len })
      else if (/^[A-D]$/.test(up)) out.push({ kind: 'var', name: up, pos: i, len })
      else out.push({ kind: 'ident', name: text, pos: i, len })
      i = j
      continue
    }
    if (c >= '0' && c <= '9') {
      let j = i + 1
      while (j < src.length && isWordChar(src[j]!)) j++
      const text = src.slice(i, j)
      if (text !== '0' && text !== '1') {
        throw new LogicError(`"${text}" is not a value: use 0 or 1 (or put a space or operator between terms)`, i, j - i)
      }
      out.push({ kind: 'const', value: text === '1', pos: i, len: j - i })
      i = j
      continue
    }
    const sym = SYMBOLS.find(([s]) => src.startsWith(s, i))
    if (!sym) throw new LogicError(`I don't recognise "${c}"`, i)
    const [text, what] = sym
    if (what === 'AND' || what === 'OR' || what === 'XOR') out.push({ kind: 'bin', op: what, pos: i, len: text.length })
    else out.push({ kind: what as 'not' | 'lparen' | 'rparen' | 'sep' | 'eq', pos: i, len: text.length })
    i += text.length
  }
  out.push({ kind: 'end', pos: src.length, len: 0 })
  return out
}
