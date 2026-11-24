import type { DisplayStyle, Granularity } from './derive/rows'
import { sanitizeSeed, sanitizeStudyConfig } from './study/session'
import { DEFAULT_STUDY_CONFIG, type StudyConfig } from './study/types'
import type { LanguageId, WatchExpression } from './types'

/**
 * Everything that makes up "my workspace": what is persisted to localStorage and what a share link
 * carries. One shape, one sanitiser, so both entry points are hardened the same way.
 */
export interface Workspace {
  language: LanguageId
  code: string
  stdinText: string
  granularity: Granularity
  displayStyle: DisplayStyle
  /** Column ids the user hid. `scope:name`, `watch:<id>`, `line`, `output`, `return`, `stack`. */
  hiddenColumns: string[]
  /** User order of variable/watch columns (ids), earliest first. */
  columnOrder: string[]
  showEphemeral: boolean
  showCallables: boolean
  /** Show the Condition (True/False) column. Opt-in, so older workspaces and links look as before. */
  showCondition: boolean
  watches: WatchExpression[]
  /** Study Mode settings for NEW sessions (and what a teacher's share link carries). */
  studyConfig: StudyConfig
  /** Seed for the random mask; 0 = not chosen yet. */
  studySeed: number
}

/** The call-stack column is opt-in. */
export const DEFAULT_HIDDEN_COLUMNS = ['stack']

export const LIMITS = {
  code: 100_000,
  stdin: 20_000,
  columnIds: 300,
  columnIdLength: 200,
  watches: 20,
  watchExprLength: 500,
  idLength: 64,
} as const

const LANGUAGES: readonly string[] = ['python', 'javascript', 'java', 'cpp', 'csharp']

export function defaultWorkspace(code = '', stdinText = ''): Workspace {
  return {
    language: 'python',
    code,
    stdinText,
    granularity: 'compact',
    displayStyle: 'exam',
    hiddenColumns: [...DEFAULT_HIDDEN_COLUMNS],
    columnOrder: [],
    showEphemeral: false,
    showCallables: false,
    showCondition: false,
    watches: [],
    studyConfig: { ...DEFAULT_STUDY_CONFIG },
    studySeed: 0,
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' && v.length <= max ? v : undefined)

function strings(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: string[] = []
  for (const x of v.slice(0, LIMITS.columnIds)) {
    const s = str(x, LIMITS.columnIdLength)
    if (s !== undefined && !out.includes(s)) out.push(s)
  }
  return out
}

function sanitizeScope(v: unknown): WatchExpression['scope'] {
  if (isRecord(v)) {
    if (v.kind === 'module') return { kind: 'module' }
    if (v.kind === 'function') {
      const name = str(v.name, LIMITS.columnIdLength)
      if (name) return { kind: 'function', name }
    }
  }
  return { kind: 'current' }
}

export function sanitizeWatches(v: unknown): WatchExpression[] | undefined {
  if (!Array.isArray(v)) return undefined
  const out: WatchExpression[] = []
  const seen = new Set<string>()
  for (const w of v.slice(0, LIMITS.watches)) {
    if (!isRecord(w)) continue
    const id = str(w.id, LIMITS.idLength)
    const expr = str(w.expr, LIMITS.watchExprLength)
    if (!id || expr === undefined || seen.has(id)) continue
    seen.add(id)
    const label = str(w.label, LIMITS.watchExprLength)
    out.push({ id, expr, ...(label ? { label } : {}), scope: sanitizeScope(w.scope), enabled: w.enabled !== false })
  }
  return out
}

/**
 * Builds a valid Workspace from untrusted input (old localStorage, a share link). Every field is
 * checked individually; anything missing or malformed falls back to `fallback`. The result is always
 * built from picked fields, never by spreading the input, so `__proto__`-style keys can't leak in.
 */
export function sanitizeWorkspace(input: unknown, fallback: Workspace): Workspace {
  const o = isRecord(input) ? input : {}
  return {
    language: typeof o.language === 'string' && LANGUAGES.includes(o.language) ? (o.language as LanguageId) : fallback.language,
    code: str(o.code, LIMITS.code) ?? fallback.code,
    stdinText: str(o.stdinText, LIMITS.stdin) ?? fallback.stdinText,
    granularity: o.granularity === 'compact' || o.granularity === 'every-line' ? o.granularity : fallback.granularity,
    displayStyle: o.displayStyle === 'exam' || o.displayStyle === 'carry' ? o.displayStyle : fallback.displayStyle,
    hiddenColumns: strings(o.hiddenColumns) ?? fallback.hiddenColumns,
    columnOrder: strings(o.columnOrder) ?? fallback.columnOrder,
    showEphemeral: typeof o.showEphemeral === 'boolean' ? o.showEphemeral : fallback.showEphemeral,
    showCallables: typeof o.showCallables === 'boolean' ? o.showCallables : fallback.showCallables,
    showCondition: typeof o.showCondition === 'boolean' ? o.showCondition : fallback.showCondition,
    watches: sanitizeWatches(o.watches) ?? fallback.watches,
    studyConfig: sanitizeStudyConfig(o.studyConfig, fallback.studyConfig),
    studySeed: sanitizeSeed(o.studySeed, fallback.studySeed),
  }
}
