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
  branch?: boolean
  watches: Record<string, WatchResult>
}

// ───────────── Result ─────────────
export type ColumnId = string // 'line' | 'output' | 'return' | 'stack' | `${scope}:${name}` | `watch:${id}`

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
}
export interface TraceRow {
  rowIndex: number
  stepIndices: number[]
  lineNumber: number
  depth: number
  cells: Record<ColumnId, Cell>
}
