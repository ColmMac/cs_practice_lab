/** Boolean expression AST. Plain data (no positions) so structural equality works in tests. */
export type BinOp = 'AND' | 'NAND' | 'XOR' | 'OR' | 'NOR'

export type Expr =
  | { type: 'var'; name: string }
  | { type: 'const'; value: boolean }
  | { type: 'not'; arg: Expr }
  | { type: 'bin'; op: BinOp; left: Expr; right: Expr }

export interface Output {
  name: string
  expr: Expr
}

export interface Program {
  outputs: Output[]
  /** Variables used anywhere in the program, sorted A..D. */
  variables: string[]
}

export const VARIABLES = ['A', 'B', 'C', 'D'] as const
export const MAX_OUTPUTS = 4
export const MAX_LENGTH = 300
export const MAX_DEPTH = 40

/** A friendly, positioned parse error. `position`/`length` index into the source string. */
export class LogicError extends Error {
  readonly position: number
  readonly length: number
  constructor(message: string, position: number, length = 1) {
    super(message)
    this.name = 'LogicError'
    this.position = position
    this.length = length
  }
}
