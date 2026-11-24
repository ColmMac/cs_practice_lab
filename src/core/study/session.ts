import { DEFAULT_STUDY_CONFIG, type MaskMode, type StudyConfig } from './types'

/** What is remembered about a study session (per program run, keyed by `executionKey`). */
export interface StudySessionData {
  config: StudyConfig
  seed: number
  /** cellKey → what the student typed */
  answers: Record<string, string>
  /** cellKeys the student gave up on and revealed (excluded from the score) */
  revealed: string[]
}

export const MAX_STUDY_SESSIONS = 5
export const MAX_ANSWER_LENGTH = 500
export const MAX_ANSWERS = 2000

const MASK_MODES: readonly MaskMode[] = ['all', 'random', 'columns']
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/
const CELL_KEY = /^\d{1,9}:\S{1,200}$/

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function sanitizeSeed(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 2 ** 32 ? v : fallback
}

/** Field-by-field cleanup of untrusted study settings (localStorage, share links). */
export function sanitizeStudyConfig(v: unknown, fallback: StudyConfig = DEFAULT_STUDY_CONFIG): StudyConfig {
  const o = isRecord(v) ? v : {}
  const columns = Array.isArray(o.columns)
    ? [...new Set(o.columns.filter((c): c is string => typeof c === 'string' && c.length > 0 && c.length <= 200))].slice(0, 300)
    : fallback.columns
  return {
    maskMode: MASK_MODES.includes(o.maskMode as MaskMode) ? (o.maskMode as MaskMode) : fallback.maskMode,
    percent: typeof o.percent === 'number' && Number.isFinite(o.percent) ? Math.min(100, Math.max(0, Math.round(o.percent))) : fallback.percent,
    columns,
    outputOnly: typeof o.outputOnly === 'boolean' ? o.outputOnly : fallback.outputOnly,
    closeCredit: o.closeCredit === 0 || o.closeCredit === 0.5 ? o.closeCredit : fallback.closeCredit,
  }
}

function sanitizeSession(v: unknown): StudySessionData | null {
  if (!isRecord(v)) return null
  const answers: Record<string, string> = {}
  if (isRecord(v.answers)) {
    let n = 0
    for (const [k, a] of Object.entries(v.answers)) {
      if (n >= MAX_ANSWERS) break
      if (CELL_KEY.test(k) && typeof a === 'string' && a.length <= MAX_ANSWER_LENGTH) {
        answers[k] = a
        n++
      }
    }
  }
  const revealed = Array.isArray(v.revealed)
    ? [...new Set(v.revealed.filter((k): k is string => typeof k === 'string' && CELL_KEY.test(k)))].slice(0, MAX_ANSWERS)
    : []
  return { config: sanitizeStudyConfig(v.config), seed: sanitizeSeed(v.seed), answers, revealed }
}

/** Cleans stored sessions: valid ids only, at most MAX_STUDY_SESSIONS, `order` lists them oldest → newest. */
export function sanitizeSessions(
  sessions: unknown,
  order: unknown,
): { studySessions: Record<string, StudySessionData>; studyOrder: string[] } {
  const studySessions: Record<string, StudySessionData> = {}
  if (isRecord(sessions)) {
    for (const [id, raw] of Object.entries(sessions)) {
      const s = KEY_ID.test(id) ? sanitizeSession(raw) : null
      if (s) studySessions[id] = s
    }
  }
  let studyOrder = Array.isArray(order) ? order.filter((id): id is string => typeof id === 'string' && id in studySessions) : []
  studyOrder = [...new Set(studyOrder)]
  for (const id of Object.keys(studySessions)) if (!studyOrder.includes(id)) studyOrder.push(id) // sessions the order forgot
  while (studyOrder.length > MAX_STUDY_SESSIONS) delete studySessions[studyOrder.shift()!]
  return { studySessions, studyOrder }
}

/** Stores `data` as the most recent session and forgets the oldest beyond MAX_STUDY_SESSIONS. */
export function rememberSession(
  sessions: Record<string, StudySessionData>,
  order: string[],
  id: string,
  data: StudySessionData,
): { studySessions: Record<string, StudySessionData>; studyOrder: string[] } {
  const studySessions = { ...sessions, [id]: data }
  const studyOrder = [...order.filter((x) => x !== id), id]
  while (studyOrder.length > MAX_STUDY_SESSIONS) delete studySessions[studyOrder.shift()!]
  return { studySessions, studyOrder }
}
