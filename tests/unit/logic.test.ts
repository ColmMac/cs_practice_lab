import { describe, expect, it } from 'vitest'
import {
  LogicError,
  MAX_DEPTH,
  MAX_LENGTH,
  applyOp,
  evaluate,
  parseExpression,
  parseProgram,
  print,
  subexpressions,
  type BinOp,
  type Expr,
  type Notation,
} from '../../src/core/logic'
import { mulberry32 } from '../../src/core/study/rng'

const VARS = ['A', 'B', 'C', 'D']
const rowsOf = (n: number) =>
  Array.from({ length: 1 << n }, (_, r) =>
    Object.fromEntries(VARS.slice(0, n).map((v, i) => [v, Boolean((r >> (n - 1 - i)) & 1)])),
  )
const truth = (src: string, n = 4) => {
  const e = parseExpression(src)
  return rowsOf(n).map((env) => evaluate(e, env))
}
const err = (src: string): LogicError => {
  try {
    parseProgram(src)
  } catch (e) {
    if (e instanceof LogicError) return e
    throw e
  }
  throw new Error(`expected "${src}" to fail`)
}
const v = (name: string): Expr => ({ type: 'var', name })
const bin = (op: BinOp, left: Expr, right: Expr): Expr => ({ type: 'bin', op, left, right })

describe('operators match their definitions over every row', () => {
  const defs: [string, string[], (a: boolean, b: boolean) => boolean][] = [
    ['AND', ['A AND B', 'A && B', 'A & B', 'A · B', 'A ∧ B', 'a and b'], (a, b) => a && b],
    ['OR', ['A OR B', 'A || B', 'A | B', 'A + B', 'A ∨ B', 'a Or b'], (a, b) => a || b],
    ['XOR', ['A XOR B', 'A ^ B', 'A ⊕ B', 'a xor b'], (a, b) => a !== b],
    ['NAND', ['A NAND B', 'a nand b'], (a, b) => !(a && b)],
    ['NOR', ['A NOR B', 'a nor b'], (a, b) => !(a || b)],
  ]
  for (const [name, spellings, f] of defs) {
    it(name, () => {
      const expected = rowsOf(2).map((r) => f(r.A!, r.B!))
      for (const s of spellings) expect(truth(s, 2), s).toEqual(expected)
    })
  }

  it('NOT in all its spellings, and literals', () => {
    for (const s of ['NOT A', '!A', '~A', '¬A', 'not a']) expect(truth(s, 1), s).toEqual([true, false])
    expect(truth('1', 0)).toEqual([true])
    expect(truth('TRUE and FALSE', 0)).toEqual([false])
    expect(truth('true OR 0', 0)).toEqual([true])
  })

  it('applyOp agrees with evaluate', () => {
    for (const op of ['AND', 'NAND', 'XOR', 'OR', 'NOR'] as const)
      for (const a of [false, true])
        for (const b of [false, true])
          expect(evaluate(bin(op, v('A'), v('B')), { A: a, B: b })).toBe(applyOp(op, a, b))
  })
})

describe('precedence and associativity', () => {
  it('NOT > AND > XOR > OR', () => {
    expect(parseExpression('A OR B AND C')).toEqual(bin('OR', v('A'), bin('AND', v('B'), v('C'))))
    expect(parseExpression('A OR B XOR C')).toEqual(bin('OR', v('A'), bin('XOR', v('B'), v('C'))))
    expect(parseExpression('A XOR B AND C')).toEqual(bin('XOR', v('A'), bin('AND', v('B'), v('C'))))
    expect(parseExpression('NOT A AND B')).toEqual(bin('AND', { type: 'not', arg: v('A') }, v('B')))
    expect(parseExpression('A NAND B AND C')).toEqual(bin('AND', bin('NAND', v('A'), v('B')), v('C')))
    expect(parseExpression('A NOR B OR C')).toEqual(bin('OR', bin('NOR', v('A'), v('B')), v('C')))
  })

  it('is left-associative (matters for NAND and NOR)', () => {
    expect(parseExpression('A NAND B NAND C')).toEqual(bin('NAND', bin('NAND', v('A'), v('B')), v('C')))
    expect(parseExpression('A NOR B NOR C')).toEqual(bin('NOR', bin('NOR', v('A'), v('B')), v('C')))
    expect(parseExpression('A OR B NOR C')).toEqual(bin('NOR', bin('OR', v('A'), v('B')), v('C')))
  })

  it('NOT stacks and brackets override precedence', () => {
    expect(parseExpression('NOT NOT A')).toEqual({ type: 'not', arg: { type: 'not', arg: v('A') } })
    expect(parseExpression('(A OR B) AND C')).toEqual(bin('AND', bin('OR', v('A'), v('B')), v('C')))
    expect(parseExpression('NOT (A AND B)')).toEqual({ type: 'not', arg: bin('AND', v('A'), v('B')) })
  })

  it('prints the fully bracketed reading', () => {
    expect(print(parseExpression('A OR B AND C'))).toBe('A OR (B AND C)')
    expect(print(parseExpression('A OR B AND C'), 'words', true)).toBe('(A OR (B AND C))')
    expect(print(parseExpression('A + B · !C'), 'symbols')).toBe('A ∨ (B ∧ ¬C)')
    expect(print(parseExpression('NOT (A NAND B) XOR C'), 'ascii')).toBe('!(A NAND B) ^ C')
  })
})

describe('De Morgan equivalences hold over all rows', () => {
  const pairs: [string, string][] = [
    ['NOT (A AND B)', 'NOT A OR NOT B'],
    ['NOT (A OR B)', 'NOT A AND NOT B'],
    ['A NAND B', 'NOT A OR NOT B'],
    ['A NOR B', 'NOT A AND NOT B'],
    ['A XOR B', '(A OR B) AND NOT (A AND B)'],
    ['A XOR B', '(A AND NOT B) OR (NOT A AND B)'],
    ['NOT (A AND B AND C)', 'NOT A OR NOT B OR NOT C'],
    ['NOT (A OR B OR C OR D)', 'NOT A AND NOT B AND NOT C AND NOT D'],
  ]
  for (const [l, r] of pairs) it(`${l}  ≡  ${r}`, () => expect(truth(l)).toEqual(truth(r)))

  it('a non-equivalence is detected', () => {
    expect(truth('NOT (A AND B)')).not.toEqual(truth('NOT A AND NOT B'))
  })
})

describe('programs with several outputs', () => {
  it('parses named outputs separated by ; or newlines', () => {
    for (const src of ['S = A XOR B; C = A AND B', 'S = A XOR B\nC = A AND B\n', ' S=A xor B ;; C=A & B; ']) {
      const p = parseProgram(src)
      expect(p.outputs.map((o) => o.name)).toEqual(['S', 'C'])
      expect(p.variables).toEqual(['A', 'B'])
      expect(p.outputs[0]!.expr).toEqual(bin('XOR', v('A'), v('B')))
    }
  })

  it('names unnamed outputs Q, or Q1.. when there are several', () => {
    expect(parseProgram('A AND B').outputs.map((o) => o.name)).toEqual(['Q'])
    expect(parseProgram('A AND B; C').outputs.map((o) => o.name)).toEqual(['Q1', 'Q2'])
    expect(parseProgram('Sum = A; B').outputs.map((o) => o.name)).toEqual(['Sum', 'Q2'])
  })

  it('collects variables across outputs, sorted', () => {
    expect(parseProgram('X = D; Y = B OR A').variables).toEqual(['A', 'B', 'D'])
    expect(parseProgram('1').variables).toEqual([])
  })

  it('allows 4 outputs but not 5, and rejects duplicate or input-named outputs', () => {
    expect(parseProgram('P=A; Q=B; R=C; S=D').outputs).toHaveLength(4)
    expect(err('P=A; Q=B; R=C; S=D; T=A').message).toMatch(/at most 4/i)
    const dup = err('S = A; s = B')
    expect(dup.message).toMatch(/used twice/)
    expect(dup.position).toBe(7)
    expect(parseProgram('S = A XOR B; C = A AND B').outputs.map((o) => o.name)).toEqual(['S', 'C'])
    const both = err('C = A AND B; S = C')
    expect(both.message).toMatch(/both an input and an output/)
    expect(both.position).toBe(0)
  })
})

describe('error messages and positions', () => {
  it('names what was expected after an operator, and where', () => {
    const e = err('A AND')
    expect(e.message).toBe("Expected a variable or '(' after AND, but found the end of the expression")
    expect(e.position).toBe(5)
    const e2 = err('A AND OR B')
    expect(e2.message).toMatch(/after AND, but found "OR"/)
    expect(e2.position).toBe(6)
    expect(e2.length).toBe(2)
  })

  it('reports an empty program, an operator at the start, and a stray ")"', () => {
    expect(err('   ').message).toMatch(/Type an expression/)
    const lead = err('AND A')
    expect(lead.position).toBe(0)
    expect(lead.message).toMatch(/Expected a variable, 0, 1 or '\('/)
    const rp = err('A AND B)')
    expect(rp.message).toMatch(/no matching/)
    expect(rp.position).toBe(7)
  })

  it('reports an unclosed bracket', () => {
    const e = err('(A AND B')
    expect(e.message).toMatch(/Expected '\)'/)
    expect(e.position).toBe(8)
  })

  it('reports a missing operator', () => {
    const e = err('A B')
    expect(e.message).toMatch(/Expected an operator/)
    expect(e.position).toBe(2)
    expect(err('A (B)').position).toBe(2)
  })

  it('reports unknown characters and words', () => {
    const c = err('A @ B')
    expect(c.message).toMatch(/recognise "@"/)
    expect(c.position).toBe(2)
    const w = err('E AND A')
    expect(w.message).toMatch(/don't know "E"/)
    expect(w.position).toBe(0)
    expect(err('AANDB').message).toMatch(/spaces/)
    expect(err('A AND 2').message).toMatch(/use 0 or 1/)
    expect(err('A AND 10').position).toBe(6)
  })

  it('reports a misplaced "="', () => {
    expect(err('A = ').message).toMatch(/Expected a variable/)
    expect(err('S = A = B').message).toMatch(/'=' can only follow/)
  })
})

describe('limits', () => {
  it(`rejects more than ${MAX_LENGTH} characters, accepts exactly ${MAX_LENGTH}`, () => {
    const ok = 'A'.padEnd(MAX_LENGTH, ' ')
    expect(ok).toHaveLength(MAX_LENGTH)
    expect(() => parseProgram(ok)).not.toThrow()
    const e = err(ok + ' ')
    expect(e.message).toMatch(/too long/)
  })

  it(`accepts nesting depth ${MAX_DEPTH} and rejects ${MAX_DEPTH + 1}`, () => {
    const nest = (n: number) => '('.repeat(n) + 'A' + ')'.repeat(n)
    expect(() => parseProgram(nest(MAX_DEPTH))).not.toThrow()
    const e = err(nest(MAX_DEPTH + 1))
    expect(e.message).toMatch(/nested too deeply/)
    expect(() => parseProgram('NOT '.repeat(MAX_DEPTH) + 'A')).not.toThrow()
    expect(err('NOT '.repeat(MAX_DEPTH + 1) + 'A').message).toMatch(/nested too deeply/)
  })

  it('does not blow the stack on adversarial input within the limits', () => {
    expect(() => parseProgram('A OR '.repeat(59) + 'A')).not.toThrow()
    expect(() => parseProgram('('.repeat(299))).toThrow(LogicError)
  })
})

describe('subexpressions', () => {
  it('is post-order, deduplicated, and excludes bare variables and constants', () => {
    const e = parseExpression('(A AND B) OR NOT (A AND B) XOR 1')
    expect(subexpressions(e).map((x) => print(x))).toEqual([
      'A AND B',
      'NOT (A AND B)',
      'NOT (A AND B) XOR 1',
      '(A AND B) OR (NOT (A AND B) XOR 1)',
    ])
  })

  it('operands come before the operations that use them', () => {
    const subs = subexpressions(parseExpression('NOT (A OR B) AND (C NAND D)')).map((x) => print(x))
    expect(subs).toEqual(['A OR B', 'NOT (A OR B)', 'C NAND D', 'NOT (A OR B) AND (C NAND D)'])
  })

  it('has nothing for a bare variable', () => {
    expect(subexpressions(v('A'))).toEqual([])
  })
})

describe('print → parse round trip', () => {
  const randomExpr = (rng: () => number, depth: number): Expr => {
    const r = rng()
    if (depth <= 0 || r < 0.2) {
      return rng() < 0.15 ? { type: 'const', value: rng() < 0.5 } : v(VARS[Math.floor(rng() * 4)]!)
    }
    if (r < 0.4) return { type: 'not', arg: randomExpr(rng, depth - 1) }
    const ops: BinOp[] = ['AND', 'NAND', 'XOR', 'OR', 'NOR']
    return bin(ops[Math.floor(rng() * ops.length)]!, randomExpr(rng, depth - 1), randomExpr(rng, depth - 1))
  }

  it('gives back the same AST in every notation (400 random expressions)', () => {
    const rng = mulberry32(20240607)
    for (let n = 0; n < 400; n++) {
      const e = randomExpr(rng, 1 + Math.floor(rng() * 4))
      for (const notation of ['words', 'symbols', 'ascii'] as Notation[]) {
        for (const outer of [false, true]) {
          const text = print(e, notation, outer)
          expect(parseExpression(text), `${notation}: ${text}`).toEqual(e)
        }
      }
    }
  })

  it('a program round trips too, and the bracketed reading means the same on every row', () => {
    const rng = mulberry32(7)
    for (let n = 0; n < 100; n++) {
      const e = randomExpr(rng, 4)
      const again = parseExpression(print(e, 'words', true))
      for (const env of rowsOf(4)) expect(evaluate(again, env)).toBe(evaluate(e, env))
    }
  })

  it('parsing user text then printing then parsing is stable', () => {
    for (const src of ['A OR B AND C XOR D', '!(A & B) | ~C', 'NOT NOT NOT A NOR B NAND C']) {
      const once = parseExpression(src)
      expect(parseExpression(print(once))).toEqual(once)
    }
  })
})

describe('evaluate', () => {
  it('throws on a missing variable value (a bug, not user error)', () => {
    expect(() => evaluate(v('A'), {})).toThrow(/No value/)
  })
})
