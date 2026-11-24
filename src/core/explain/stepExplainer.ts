/**
 * Deterministic "Why was this wrong?" text for one trace-table cell, built only from the recorded trace
 * and the static line description. Nothing is evaluated, and it is language-neutral: the language
 * supplies `format`.
 *
 * With `withResult: false` the text shows the working but never the cell's own result (grading messages
 * must never contain the ground truth). Everything that states the result is added only when
 * `withResult` is true.
 */
import { CONDITION_COL, OUTPUT_COL, RETURN_COL, WATCH_PREFIX } from '../derive/columns'
import { formatOutput } from '../derive/rows'
import { cellKey } from '../study/types'
import type { ColumnId, LineExpr, LineInfo, TraceResult, TraceStep, Value } from '../types'

export interface ExplainPart {
  t: 'text' | 'code' | 'result'
  s: string
}

export interface Explanation {
  parts: ExplainPart[]
}

export interface ExplainContext {
  result: TraceResult
  format: (v: Value) => string
  /**
   * Is the value in this column, as it stood before step `beforeStep` ran, one the student still has to
   * work out? Such a name is never replaced by its value. `frameId` is the frame the value is read from.
   */
  isHidden?: (columnId: ColumnId, beforeStep: number, frameId: number) => boolean
  /** What a watch column watches (its header). */
  watchText?: (columnId: ColumnId) => string
}

const MAX_SUBSTITUTED_STRING = 20

const text = (s: string): ExplainPart => ({ t: 'text', s })
const code = (s: string): ExplainPart => ({ t: 'code', s })
const result = (s: string): ExplainPart => ({ t: 'result', s })

/**
 * An `isHidden` for a study session: the step that last wrote the value (in that exact frame, so
 * recursion levels are not confused) is a masked question that is not yet `known` (answered correctly,
 * or revealed).
 */
export function maskedValueGuard(
  trace: TraceResult,
  maskedKeys: ReadonlySet<string>,
  known: (key: string) => boolean,
): NonNullable<ExplainContext['isHidden']> {
  return (columnId, beforeStep, frameId) => {
    const name = columnId.slice(columnId.indexOf(':') + 1)
    for (let i = beforeStep - 1; i >= 0; i--) {
      if (!trace.steps[i]!.writes.some((w) => w.frameId === frameId && w.name === name)) continue
      const key = cellKey(i, columnId)
      return maskedKeys.has(key) && !known(key)
    }
    return false
  }
}

/** `a`, `a and b`, `a, b and c`, for lists of part groups. */
function joinGroups(groups: ExplainPart[][]): ExplainPart[] {
  return groups.flatMap((g, i) => (i === 0 ? g : [text(i === groups.length - 1 ? ' and ' : ', '), ...g]))
}

/** Only names, commas and brackets (`y`, `(b, a)`): putting the values in would BE the answer. */
function isCopy(expr: LineExpr): boolean {
  return expr.parts.some((p) => typeof p !== 'string') && expr.parts.every((p) => typeof p !== 'string' || /^[\s(),[\]]*$/.test(p))
}

/** Small scalars read well inside an expression; collections and long strings stay as names. */
function substitutable(v: Value): boolean {
  if (v.k === 'int' || v.k === 'float' || v.k === 'bool' || v.k === 'none') return true
  return v.k === 'str' && !v.truncated && v.v.length <= MAX_SUBSTITUTED_STRING
}

interface Substitution {
  /** `[name, value as shown]`, in order of first appearance */
  used: [string, string][]
  /** the expression with those values put in */
  text: string
  /** a value was held back because the student has not worked it out yet */
  withheld: boolean
}

function substitute(ctx: ExplainContext, step: TraceStep, expr: LineExpr): Substitution {
  // rows are POST-state, so the previous step's snapshot is the state before this line ran
  const scopes = ctx.result.steps[step.stepIndex - 1]?.scopes ?? []
  const local = scopes.find((s) => s.frame.id === step.frame.id)
  const globals = scopes.find((s) => s.frame.depth === 0)
  const used = new Map<string, string>()
  let withheld = false

  const out = expr.parts
    .map((p) => {
      if (typeof p === 'string') return p
      const scope = [local, globals].find((s) => s && Object.hasOwn(s.vars, p.name))
      const value = scope?.vars[p.name]
      if (!scope || !value || !substitutable(value)) return p.name
      if (ctx.isHidden?.(`${scope.frame.name}:${p.name}`, step.stepIndex, scope.frame.id)) {
        withheld = true
        return p.name
      }
      const shown = ctx.format(value)
      used.set(p.name, shown)
      return shown.startsWith('-') ? `(${shown})` : shown // -3 ** 2 is not (-3) ** 2
    })
    .join('')

  return { used: [...used], text: out, withheld }
}

const WITHHELD_NOTE = ' Values you haven’t worked out yet stay as names.'

/** The working for an expression: the values read, and the expression with them put in. */
function working(ctx: ExplainContext, step: TraceStep, info: LineInfo): ExplainPart[] {
  const expr = info.expr
  if (!expr || !expr.pure) return []
  if (isCopy(expr)) {
    return [
      text(' The value is only copied from '),
      code(expr.text),
      text(': look up what was there before this line ran. Everything is read before any name changes.'),
    ]
  }
  const sub = substitute(ctx, step, expr)
  const note = sub.withheld ? [text(WITHHELD_NOTE)] : []
  if (sub.used.length === 0) return note

  if (info.kind === 'assign') {
    const before = joinGroups(sub.used.map(([n, v]) => [code(n), text(' was '), code(v)]))
    return [text(' Before it ran, '), ...before, text(', so the right-hand side is '), code(sub.text), text('.'), ...note]
  }
  const values = joinGroups(sub.used.map(([n, v]) => [code(n), text(' = '), code(v)]))
  return [text(' With '), ...values, text(' that is '), code(sub.text), text('.'), ...note]
}

const binds = (info: LineInfo, name: string) =>
  !!info.targets?.some((t) => t === name || t.startsWith(`${name}[`) || t.startsWith(`${name}.`))

/** The statement as written; a statement split over lines is rebuilt from its parts. */
function statement(step: TraceStep, info: LineInfo): string {
  if (!info.expr || info.kind !== 'assign' || step.lineSource.includes(info.expr.text)) return step.lineSource
  return `${(info.targets ?? []).join(', ')} = ${info.expr.text}`
}

const ran = (step: TraceStep, source = step.lineSource): ExplainPart[] => [text(`Line ${step.lineNumber} ran `), code(source), text('.')]

function describeLine(ctx: ExplainContext, step: TraceStep, columnId: ColumnId): ExplainPart[] {
  const n = step.lineNumber
  if (step.kind === 'call') {
    return [text(`Line ${n} started a call to `), code(step.frame.name), text(': its parameters take the values passed in.')]
  }
  const info = ctx.result.lines?.[n]
  if (!info) return ran(step)

  // a variable that this line does not name was changed some other way (a method call, a called function)
  const isVar = ![CONDITION_COL, OUTPUT_COL, RETURN_COL].includes(columnId) && !columnId.startsWith(WATCH_PREFIX)
  if (isVar && !binds(info, columnId.slice(columnId.indexOf(':') + 1))) return ran(step)

  if (info.readsInput) return [text(`Line ${n} reads the next line of the program inputs.`)]

  const expr = info.expr
  switch (info.kind) {
    case 'assign':
      return [...ran(step, statement(step, info)), ...working(ctx, step, info)]
    case 'augassign': {
      if (!expr) return ran(step)
      const head = [text(`Line ${n} ran `), code(step.lineSource), text(', which means '), code(expr.text)]
      const sub = expr.pure ? substitute(ctx, step, expr) : null
      if (!sub || sub.used.length === 0) return [...head, text('.'), ...(sub?.withheld ? [text(WITHHELD_NOTE)] : [])]
      const values = joinGroups(sub.used.map(([name, v]) => [code(name), text(' = '), code(v)]))
      return [...head, text('; with '), ...values, text(' that is '), code(sub.text), text('.'), ...(sub.withheld ? [text(WITHHELD_NOTE)] : [])]
    }
    case 'if':
    case 'elif':
    case 'while':
      if (!expr) return ran(step)
      return [text(`Line ${n} tested `), code(expr.text), text('.'), ...working(ctx, step, info)]
    case 'for':
      if (!expr) return ran(step)
      return [text(`Line ${n} asks `), code(expr.text), text(' for its next item.')]
    case 'return':
      if (!expr) return ran(step)
      return [text(`Line ${n} returns `), code(expr.text), text('.'), ...working(ctx, step, info)]
    case 'output':
      return expr ? [text(`Line ${n} printed `), code(expr.text), text('.')] : ran(step)
    default:
      return ran(step)
  }
}

/** What happens after a test, in words. */
function consequence(kind: string | undefined, branch: boolean): string {
  if (kind === 'while') return branch ? 'so the loop body runs' : 'so the loop ends'
  return branch ? 'so the body runs' : 'so the body is skipped'
}

/** The sentence that states the cell's value. Only ever shown once the student has revealed it. */
function outcome(ctx: ExplainContext, step: TraceStep, columnId: ColumnId): ExplainPart[] {
  if (columnId === OUTPUT_COL) return [text(' The output is '), result(formatOutput(step.stdoutDelta)), text('.')]

  if (columnId === RETURN_COL) {
    return step.returnValue ? [text(' The value returned is '), result(ctx.format(step.returnValue)), text('.')] : []
  }

  if (columnId === CONDITION_COL) {
    if (step.branch === undefined) return []
    const value = ctx.format({ k: 'bool', v: step.branch })
    const kind = ctx.result.lines?.[step.lineNumber]?.kind
    if (kind === 'for') {
      return [
        text(' The condition is '),
        result(value),
        text(': '),
        result(step.branch ? 'there is another item, so the loop body runs' : 'there are no items left, so the loop ends'),
        text('.'),
      ]
    }
    return [text(' The condition is '), result(value), text(', '), result(consequence(kind, step.branch)), text('.')]
  }

  if (columnId.startsWith(WATCH_PREFIX)) {
    const watch = step.watches[columnId.slice(WATCH_PREFIX.length)]
    return watch?.ok ? [text(' So the watch shows '), result(ctx.format(watch.value)), text('.')] : []
  }

  const split = columnId.indexOf(':')
  const scopeName = columnId.slice(0, split)
  const name = columnId.slice(split + 1)
  // innermost live frame of that scope wins, as in the table itself
  const scope = [...step.scopes].reverse().find((s) => s.frame.name === scopeName && Object.hasOwn(s.vars, name))
  if (!scope) return []
  return [text(' So '), code(name), text(step.kind === 'call' ? ' is ' : ' becomes '), result(ctx.format(scope.vars[name]!)), text('.')]
}

/** Why the cell (`stepIndex`, `columnId`) holds what it holds. */
export function explainCell(
  ctx: ExplainContext,
  stepIndex: number,
  columnId: ColumnId,
  { withResult }: { withResult: boolean },
): Explanation {
  const step = ctx.result.steps[stepIndex]
  if (!step) return { parts: [] }

  const parts = columnId.startsWith(WATCH_PREFIX)
    ? [text('This column watches '), code(ctx.watchText?.(columnId) ?? 'an expression'), text(', checked after line '), text(`${step.lineNumber} ran `), code(step.lineSource), text('.')]
    : describeLine(ctx, step, columnId)

  return { parts: withResult ? [...parts, ...outcome(ctx, step, columnId)] : parts }
}

/** The explanation as one plain string, with code and results in backticks. */
export function explanationText({ parts }: Explanation): string {
  return parts.map((p) => (p.t === 'text' ? p.s : `\`${p.s}\``)).join('')
}
