// Language-neutral trace data model. See PLAN.md §3. Everything here is immutable and JSON-safe.

export type LanguageId = 'python' | 'javascript' | 'java' | 'cpp' | 'csharp'

// ───────────── Values ─────────────
export type Value =
  | { k: 'none' }
  | { k: 'bool'; v: boolean }
  | { k: 'int'; v: string } // string: arbitrary precision
  | { k: 'float'; v: string } // repr(): '0.1', 'inf', 'nan', '3.0'
  | { k: 'str'; v: string; truncated?: number }
  | { k: 'list' | 'tuple' | 'set' | 'frozenset'; items: Value[]; ref: number; truncated?: number }
  | { k: 'dict'; entries: [Value, Value][]; ref: number; truncated?: number }
  | { k: 'object'; type: string; fields: Record<string, Value>; ref: number }
  | { k: 'cycle'; ref: number }
  | { k: 'opaque'; type: string; repr: string }

// ───────────── Frames & steps ─────────────
export interface FrameInfo {
  id: number // unique per call within a run (0 = module)
  name: string // '<module>', 'fact', 'Stack.push'
  depth: number // 0 = module
  callLine?: number
  argsLabel?: string // 'fact(n=3)'
}

export interface VarRef {
  frameId: number
  name: string
}

export interface ScopeSnapshot {
  frame: FrameInfo
  vars: Record<string, Value>
}

export type StepKind = 'call' | 'line' | 'return' | 'exception'

export type WatchResult =
  | { ok: true; value: Value }
  | { ok: false; reason: 'not-in-scope' | 'error' | 'rejected'; message: string }

// ───────────── Static line info ─────────────
/** Control-flow headers whose outcome is `TraceStep.branch`. */
export type HeaderKind = 'if' | 'elif' | 'while' | 'for'
export type StatementKind = HeaderKind | 'assign' | 'augassign' | 'return' | 'output' | 'other'

/** An expression as a template: literal text and variable references, e.g. ['', {name:'count'}, ' + 1']. */
export type ExprPart = string | { name: string }

export interface LineExpr {
  /** Source text as written (`i < len(items) and not found`), at most 200 characters. */
  text: string
  /** Normalised template for substitution. */
  parts: ExprPart[]
  /** No calls except safe built-ins and nothing that binds or defers: safe to restate with values
   *  substituted. Impure expressions are quoted but never substituted. */
  pure: boolean
}

export interface LineInfo {
  kind: StatementKind
  /** if/elif/while: the test · for: the iterable · assign: the value · augassign: `target op value`
   *  · return: the value · output: the printed arguments */
  expr?: LineExpr
  /** assign / augassign / for: names (or target source text, e.g. `nums[j]`) bound by the line */
  targets?: string[]
  /** the right-hand side reads program input */
  readsInput?: boolean
  /** a header with its body on the same line: its outcome can't be observed */
  oneLine?: boolean
  /** the line only gives plain names values written out in the code (`total = 0`) */
  constant?: boolean
}

export interface TraceStep {
  stepIndex: number
  kind: StepKind
  lineNumber: number
  lineSource: string
  frame: FrameInfo
  callStack: FrameInfo[]
  scopes: ScopeSnapshot[]
  writes: VarRef[]
  deletes: VarRef[]
  stdoutDelta: string
  returnValue?: Value
  exception?: { type: string; message: string; caught: boolean }
  /** Header lines only (see LineInfo.kind). if/elif/while: the condition's value (True = body entered).
   *  for: another item was taken (False = the loop is exhausted). Undefined for one-line bodies
   *  (`if x: y`), where the next line event cannot tell, and when the header raised or was cut off. */
  branch?: boolean
  watches: Record<string, WatchResult>
}

// ───────────── Result ─────────────
export type ColumnId = string // 'line' | 'cond' | 'output' | 'return' | 'stack' | `${scope}:${name}` | `watch:${id}`

export type TraceStatus =
  | 'ok'
  | 'syntax-error'
  | 'runtime-error'
  | 'step-limit'
  | 'timeout'
  | 'awaiting-input'
  | 'cancelled'
  | 'internal-error'

export interface TraceError {
  kind: TraceStatus
  type?: string
  message: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  traceback?: { line: number; functionName: string }[]
}

export interface VariableMeta {
  columnId: ColumnId
  scopeName: string
  name: string
  firstStep: number
  ephemeral: boolean
}

export interface TraceResult {
  runId: string
  language: LanguageId
  status: TraceStatus
  steps: TraceStep[]
  variables: VariableMeta[]
  functions: string[]
  stdout: string
  error?: TraceError
  inputRequest?: { prompt: string; consumedCount: number }
  stats: { stepsExecuted: number; durationMs: number; truncated: boolean }
  executionKey: string
  /** Per source line (1-based): what the first statement on that line is. Static, so one entry per line,
   *  not per step. Optional: old fixtures and the fake runner have none. */
  lines?: Record<number, LineInfo>
}

// ───────────── Options & watches ─────────────
export interface WatchExpression {
  id: string
  expr: string
  label?: string
  scope: { kind: 'current' } | { kind: 'function'; name: string } | { kind: 'module' }
  enabled: boolean
}

export interface TraceOptions {
  maxSteps: number // raw line events (default 1000)
  timeoutMs: number // default 3000
  maxCallDepth: number // default 100
  stdin: string[]
  watches: WatchExpression[]
  randomSeed: number
  valueLimits: { maxItems: number; maxDepth: number; maxStringLength: number }
  showCallables: boolean
  signal?: AbortSignal
  onProgress?: (p: { stepsExecuted: number }) => void
}

export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  maxSteps: 1000,
  timeoutMs: 3000,
  maxCallDepth: 100,
  stdin: [],
  watches: [],
  randomSeed: 0,
  valueLimits: { maxItems: 50, maxDepth: 4, maxStringLength: 200 },
  showCallables: false,
}

// ───────────── Derived view model ─────────────
export interface ColumnDef {
  id: ColumnId
  header: string
  group?: string
  kind: 'meta' | 'var' | 'watch'
}
export interface Cell {
  value?: Value
  display: string
  written: boolean
  stale?: boolean
  /** Explanation for the cell (tooltip): why a watch failed, etc. */
  note?: string
}
export interface TraceRow {
  rowIndex: number
  stepIndices: number[]
  lineNumber: number
  depth: number
  /** if/elif/while/for header rows: did the condition send control into the body? */
  branch?: boolean
  cells: Record<ColumnId, Cell>
}
