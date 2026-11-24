import type { Expr, Program } from './ast'
import { evaluate, print, subexpressions } from './evaluate'

export type TruthNotation = '01' | 'TF'
export type ColumnGroup = 'input' | 'intermediate' | 'output'

export interface TruthColumn {
  /** Stable key: the variable name, `i<n>` for an intermediate, or `o<n>` for an output. */
  key: string
  label: string
  group: ColumnGroup
}

export interface TruthRow {
  /** 0-based row number; the inputs are its binary digits, A most significant (D4). */
  index: number
  /** One boolean per column, in column order. */
  values: boolean[]
  /** `values` spelled in the chosen notation. */
  cells: string[]
}

export interface TruthTable {
  columns: TruthColumn[]
  rows: TruthRow[]
  /** True when there are two or more outputs and they agree on every row (De Morgan demos). */
  equivalent: boolean
}

export interface TruthOptions {
  intermediates?: boolean
  notation?: TruthNotation
}

const SPELL: Record<TruthNotation, readonly [string, string]> = { '01': ['0', '1'], TF: ['F', 'T'] }

/**
 * Build the full truth table for a parsed program. Rows run 0000 → 1111 with A as the most
 * significant bit (exam convention). Intermediate columns are the non-trivial subexpressions of
 * each output (post-order, deduplicated across outputs, never repeating an output's own column).
 */
export function buildTruthTable(program: Program, options: TruthOptions = {}): TruthTable {
  const { intermediates = false, notation = '01' } = options
  const [no, yes] = SPELL[notation]
  const vars = program.variables

  const columns: TruthColumn[] = vars.map((v) => ({ key: v, label: v, group: 'input' }))
  const exprs: Expr[] = vars.map((v) => ({ type: 'var', name: v }))

  if (intermediates) {
    const seen = new Set(program.outputs.map((o) => print(o.expr, 'words', true)))
    program.outputs.forEach((o) => {
      for (const sub of subexpressions(o.expr)) {
        const key = print(sub, 'words', true)
        if (seen.has(key)) continue
        seen.add(key)
        columns.push({ key: `i${columns.length}`, label: print(sub, 'words'), group: 'intermediate' })
        exprs.push(sub)
      }
    })
  }
  program.outputs.forEach((o, i) => {
    columns.push({ key: `o${i}`, label: o.name, group: 'output' })
    exprs.push(o.expr)
  })

  const n = vars.length
  const rows: TruthRow[] = []
  for (let index = 0; index < 1 << n; index++) {
    const env = Object.fromEntries(vars.map((v, i) => [v, Boolean((index >> (n - 1 - i)) & 1)]))
    const values = exprs.map((e) => evaluate(e, env))
    rows.push({ index, values, cells: values.map((b) => (b ? yes : no)) })
  }

  const outStart = columns.length - program.outputs.length
  const equivalent =
    program.outputs.length >= 2 &&
    rows.every((r) => r.values.slice(outStart).every((b) => b === r.values[outStart]))

  return { columns, rows, equivalent }
}
