import { LogicError, MAX_DEPTH, MAX_LENGTH, MAX_OUTPUTS, VARIABLES, type BinOp, type Expr, type Output, type Program } from './ast'
import { tokenize, type Token } from './tokenizer'

/**
 * Precedence, loosest to tightest (all left-associative):
 *   OR/NOR  <  XOR  <  AND/NAND  <  NOT (prefix)
 */
const LEVELS: BinOp[][] = [['OR', 'NOR'], ['XOR'], ['AND', 'NAND']]

class Parser {
  private i = 0
  private depth = 0
  constructor(private readonly toks: Token[]) {}

  private get cur(): Token {
    return this.toks[this.i]!
  }

  atEnd(): boolean {
    return this.cur.kind === 'end' || this.cur.kind === 'sep'
  }

  private describe(t: Token): string {
    return t.kind === 'end' ? 'the end of the expression' : t.kind === 'sep' ? 'the end of this line' : `"${this.srcOf(t)}"`
  }
  private srcOf(t: Token): string {
    return this.src.slice(t.pos, t.pos + t.len)
  }
  src = ''

  parseExpr(): Expr {
    return this.parseLevel(0, 'the start')
  }

  private parseLevel(level: number, after: string): Expr {
    if (level === LEVELS.length) return this.parseUnary(after)
    let left = this.parseLevel(level + 1, after)
    for (;;) {
      const t = this.cur
      if (t.kind !== 'bin' || !LEVELS[level]!.includes(t.op)) return left
      this.i++
      const right = this.parseLevel(level + 1, t.op)
      left = { type: 'bin', op: t.op, left, right }
    }
  }

  private enter(t: Token): void {
    if (++this.depth > MAX_DEPTH) {
      throw new LogicError(`This is nested too deeply (more than ${MAX_DEPTH} levels)`, t.pos, Math.max(t.len, 1))
    }
  }

  private parseUnary(after: string): Expr {
    const t = this.cur
    switch (t.kind) {
      case 'not': {
        this.i++
        this.enter(t)
        const arg = this.parseUnary('NOT')
        this.depth--
        return { type: 'not', arg }
      }
      case 'lparen': {
        this.i++
        this.enter(t)
        const inner = this.parseLevel(0, "'('")
        if (this.cur.kind !== 'rparen') {
          throw new LogicError(`Expected ')' to close the '(' at position ${t.pos + 1}, but found ${this.describe(this.cur)}`, this.cur.pos, Math.max(this.cur.len, 1))
        }
        this.i++
        this.depth--
        return inner
      }
      case 'var':
        this.i++
        return { type: 'var', name: t.name }
      case 'const':
        this.i++
        return { type: 'const', value: t.value }
      default: {
        const where = after === 'the start' ? 'Expected' : `Expected a variable or '(' after ${after}, but found`
        const msg = after === 'the start' ? `Expected a variable, 0, 1 or '(' but found ${this.describe(t)}` : `${where} ${this.describe(t)}`
        throw new LogicError(msg, t.pos, Math.max(t.len, 1))
      }
    }
  }

  /** Statement bookkeeping for the program parser. */
  peek(offset = 0): Token {
    return this.toks[this.i + offset]!
  }
  advance(): void {
    this.i++
  }
  unexpectedTrailing(): never {
    const t = this.cur
    if (t.kind === 'rparen') throw new LogicError("There is a ')' with no matching '('", t.pos, t.len)
    if (t.kind === 'var' || t.kind === 'const' || t.kind === 'lparen' || t.kind === 'not') {
      throw new LogicError(`Expected an operator (AND, OR, XOR…) before ${this.describe(t)}`, t.pos, Math.max(t.len, 1))
    }
    if (t.kind === 'eq') throw new LogicError("'=' can only follow an output name, e.g. S = A XOR B", t.pos, t.len)
    throw new LogicError(`Unexpected ${this.describe(t)}`, t.pos, Math.max(t.len, 1))
  }
}

const usedVars = (e: Expr, into: Set<string>): void => {
  if (e.type === 'var') into.add(e.name)
  else if (e.type === 'not') usedVars(e.arg, into)
  else if (e.type === 'bin') {
    usedVars(e.left, into)
    usedVars(e.right, into)
  }
}

/**
 * Parse `A AND B` or `S = A XOR B; C = A AND B` (`;` or a newline separates outputs).
 * Throws LogicError with a position. No `eval`.
 */
export function parseProgram(src: string): Program {
  if (src.length > MAX_LENGTH) {
    throw new LogicError(`That is too long (limit ${MAX_LENGTH} characters)`, MAX_LENGTH, src.length - MAX_LENGTH)
  }
  const toks = tokenize(src)
  const p = new Parser(toks)
  p.src = src

  interface Draft {
    name: string | null
    nameTok: Token | null
    expr: Expr
  }
  const drafts: Draft[] = []
  for (;;) {
    while (p.peek().kind === 'sep') p.advance()
    if (p.peek().kind === 'end') break
    let name: string | null = null
    let nameTok: Token | null = null
    const first = p.peek()
    if ((first.kind === 'ident' || first.kind === 'var') && p.peek(1).kind === 'eq') {
      name = first.name
      nameTok = first
      p.advance()
      p.advance()
    } else if (first.kind === 'ident') {
      throw new LogicError(`I don't know "${first.name}". Inputs are ${VARIABLES.join(', ')}; put spaces around operators (e.g. A AND B)`, first.pos, first.len)
    }
    const expr = p.parseExpr()
    if (!p.atEnd()) p.unexpectedTrailing()
    drafts.push({ name, nameTok, expr })
  }

  if (drafts.length === 0) throw new LogicError('Type an expression, e.g. A AND (NOT B)', 0, 0)
  if (drafts.length > MAX_OUTPUTS) {
    throw new LogicError(`At most ${MAX_OUTPUTS} outputs are supported`, 0, src.length)
  }

  const outputs: Output[] = []
  const seen = new Set<string>()
  drafts.forEach((d, idx) => {
    const name = d.name ?? (drafts.length === 1 ? 'Q' : `Q${idx + 1}`)
    const key = name.toUpperCase()
    if (seen.has(key)) {
      const t = d.nameTok!
      throw new LogicError(`The output name ${name} is used twice`, t.pos, t.len)
    }
    seen.add(key)
    outputs.push({ name, expr: d.expr })
  })

  const vars = new Set<string>()
  outputs.forEach((o) => usedVars(o.expr, vars))
  drafts.forEach((d) => {
    if (d.nameTok && vars.has(d.nameTok.kind === 'var' ? d.nameTok.name : d.nameTok.kind === 'ident' ? d.nameTok.name.toUpperCase() : '')) {
      throw new LogicError(`${d.name} is used as both an input and an output name. Rename the output`, d.nameTok.pos, d.nameTok.len)
    }
  })
  return { outputs, variables: VARIABLES.filter((v) => vars.has(v)) }
}

/** Parse a single expression (no output names). */
export function parseExpression(src: string): Expr {
  const prog = parseProgram(src)
  if (prog.outputs.length !== 1) throw new LogicError('Expected a single expression', 0, src.length)
  return prog.outputs[0]!.expr
}
