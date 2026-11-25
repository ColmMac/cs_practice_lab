import {
  MASTERY_PERCENT,
  MAX_MASTERY_RECORDS,
  MIN_SCORED_SHARE,
  type MasteryFile,
  type MasteryRecord,
  type MasteryTool,
} from './types'

const KEY = /^trace:[a-z0-9-]{1,64}$/
const DAY = 86_400_000
const MAX_ATTEMPTS = 1_000_000

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const clamp = (v: unknown, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, Math.round(v))) : null

export const emptyMastery = (): MasteryFile => ({ v: 1, records: {} })
export const masteryKey = (tool: MasteryTool, itemId: string): string => `${tool}:${itemId}`

/** Field-by-field cleanup of what was stored. Anything that isn't version 1 is ignored as a whole. */
export function sanitizeMastery(raw: unknown, now: number): MasteryFile {
  const file = emptyMastery()
  if (!isRecord(raw) || raw.v !== 1 || !isRecord(raw.records)) return file
  const time = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= now + DAY ? v : null
  let count = 0
  for (const [key, value] of Object.entries(raw.records)) {
    if (count >= MAX_MASTERY_RECORDS) break
    if (!KEY.test(key) || !isRecord(value)) continue
    const attempts = clamp(value.attempts, MAX_ATTEMPTS)
    const best = clamp(value.bestPercent, 100)
    const last = clamp(value.lastPercent, 100)
    const practised = time(value.lastPracticedAt)
    if (attempts === null || best === null || last === null || practised === null) continue
    const mastered = value.mastered === true || best >= MASTERY_PERCENT
    const masteredAt = mastered ? time(value.masteredAt) : null
    // the key says what the record is about: stored `tool` / `itemId` fields are not trusted
    file.records[key] = {
      tool: 'trace',
      itemId: key.slice('trace:'.length),
      attempts,
      bestPercent: best,
      lastPercent: last,
      mastered,
      ...(masteredAt === null ? {} : { masteredAt }),
      lastPracticedAt: practised,
    }
    count++
  }
  return file
}

/** Whether a checked session counts: enough of the table's questions (masked or not) were actually scored. */
export const isQualifying = (scored: number, questions: number): boolean => questions > 0 && scored / questions >= MIN_SCORED_SHARE

export interface Attempt {
  tool: MasteryTool
  itemId: string
  percent: number
  /** False when this session has been counted already (Check answers pressed again): the scores update, the count doesn't. */
  newSession: boolean
}

/** A new file with one qualifying check added. The best score never goes down and `mastered` is never taken back. */
export function recordAttempt(file: MasteryFile, attempt: Attempt, now: number): MasteryFile {
  const key = masteryKey(attempt.tool, attempt.itemId)
  if (!KEY.test(key)) return file
  const old = file.records[key]
  if (!old && Object.keys(file.records).length >= MAX_MASTERY_RECORDS) return file
  const percent = clamp(attempt.percent, 100) ?? 0
  const bestPercent = Math.max(old?.bestPercent ?? 0, percent)
  const mastered = (old?.mastered ?? false) || bestPercent >= MASTERY_PERCENT
  const masteredAt = old?.masteredAt ?? (mastered && !old?.mastered ? now : undefined)
  const record: MasteryRecord = {
    tool: attempt.tool,
    itemId: attempt.itemId,
    attempts: Math.min(MAX_ATTEMPTS, (old?.attempts ?? 0) + (attempt.newSession || !old ? 1 : 0)),
    bestPercent,
    lastPercent: percent,
    mastered,
    ...(masteredAt === undefined ? {} : { masteredAt }),
    lastPracticedAt: now,
  }
  return { v: 1, records: { ...file.records, [key]: record } }
}

export interface PresetProgress {
  mastered: number
  total: number
  /** How many of these presets have any record at all. */
  practised: number
}

/** Counts only the presets that exist now: a record for a removed one is kept, but not counted. */
export function presetProgress(file: MasteryFile, tool: MasteryTool, ids: readonly string[]): PresetProgress {
  const records = ids.flatMap((id) => file.records[masteryKey(tool, id)] ?? [])
  return { mastered: records.filter((r) => r.mastered).length, total: ids.length, practised: records.length }
}

/**
 * What to practise next: the first preset (in list order) that isn't mastered. When all are, the one practised
 * longest ago (`revisit`). Null only for an empty list.
 */
export function nextUnfinished(
  file: MasteryFile,
  tool: MasteryTool,
  ids: readonly string[],
): { id: string; revisit: boolean } | null {
  const open = ids.find((id) => !file.records[masteryKey(tool, id)]?.mastered)
  if (open !== undefined) return { id: open, revisit: false }
  const when = (id: string) => file.records[masteryKey(tool, id)]?.lastPracticedAt ?? 0
  const oldest = [...ids].sort((a, b) => when(a) - when(b))[0]
  return oldest === undefined ? null : { id: oldest, revisit: true }
}

export interface RunnableItem {
  id: string
  code: string
  stdin?: string[]
}

const tidy = (text: string): string => text.replace(/\r\n/g, '\n').trimEnd()

/** The built-in whose program AND input are what just ran (line endings and trailing whitespace aside), or null. */
export function matchingItemId(ran: { code: string; stdin: string[] }, items: readonly RunnableItem[]): string | null {
  const code = tidy(ran.code)
  const stdin = tidy(ran.stdin.join('\n'))
  return items.find((i) => tidy(i.code) === code && tidy((i.stdin ?? []).join('\n')) === stdin)?.id ?? null
}
