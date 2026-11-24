import type { BinOp, Expr } from './ast'

export type Notation = 'words' | 'symbols' | 'ascii'

export const applyOp = (op: BinOp, a: boolean, b: boolean): boolean => {
  switch (op) {
    case 'AND':
      return a && b
    case 'NAND':
      return !(a && b)
    case 'XOR':
      return a !== b
    case 'OR':
      return a || b
    case 'NOR':
      return !(a || b)
  }
}

/** Evaluate under an assignment such as `{ A: true, B: false }`. A missing variable is a programming error. */
export function evaluate(e: Expr, values: Readonly<Record<string, boolean>>): boolean {
  switch (e.type) {
    case 'const':
      return e.value
    case 'var': {
      const v = values[e.name]
      if (v === undefined) throw new Error(`No value for variable ${e.name}`)
      return v
    }
    case 'not':
      return !evaluate(e.arg, values)
    case 'bin':
      return applyOp(e.op, evaluate(e.left, values), evaluate(e.right, values))
  }
}

const SPELLING: Record<Notation, { not: string; AND: string; OR: string; XOR: string }> = {
  words: { not: 'NOT ', AND: 'AND', OR: 'OR', XOR: 'XOR' },
  symbols: { not: '¬', AND: '∧', OR: '∨', XOR: '⊕' },
  ascii: { not: '!', AND: '&', OR: '|', XOR: '^' },
}

/**
 * Print with every binary operation bracketed, so the reading is unambiguous
 * (`A OR B AND C` → `A OR (B AND C)`). The outermost brackets are dropped unless `outer`.
 * Parsing the result gives back the same AST.
 */
export function print(e: Expr, notation: Notation = 'words', outer = false): string {
  const sp = SPELLING[notation]
  const go = (x: Expr, top: boolean): string => {
    switch (x.type) {
      case 'const':
        return x.value ? '1' : '0'
      case 'var':
        return x.name
      case 'not':
        return sp.not + go(x.arg, false)
      case 'bin': {
        const op = x.op === 'NAND' || x.op === 'NOR' ? x.op : sp[x.op]
        const s = `${go(x.left, false)} ${op} ${go(x.right, false)}`
        return top && !outer ? s : `(${s})`
      }
    }
  }
  return go(e, true)
}

/**
 * Non-trivial subexpressions in post-order (operands before the operations that use them),
 * deduplicated by canonical form. Bare variables and constants are excluded; the root is included.
 */
export function subexpressions(e: Expr): Expr[] {
  const seen = new Set<string>()
  const out: Expr[] = []
  const walk = (x: Expr): void => {
    if (x.type === 'var' || x.type === 'const') return
    if (x.type === 'not') walk(x.arg)
    else {
      walk(x.left)
      walk(x.right)
    }
    const key = print(x, 'words', true)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(x)
    }
  }
  walk(e)
  return out
}
