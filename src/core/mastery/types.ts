export const MASTERY_KEY = 'hub:mastery:v1'
export const MASTERY_PERCENT = 80
/** A session counts only if at least this share of the table's questions were scored (revealed cells don't count). */
export const MIN_SCORED_SHARE = 0.5
export const MAX_MASTERY_RECORDS = 200

/** Other tools can be added later: the key format already allows them. */
export type MasteryTool = 'trace'

export interface MasteryRecord {
  tool: MasteryTool
  /** built-in preset id from presets.json, e.g. 'bubble-sort' */
  itemId: string
  /** checked sessions that qualified */
  attempts: number
  /** 0..100, best qualifying Study Mode score */
  bestPercent: number
  lastPercent: number
  /** sticky once reached: bestPercent >= MASTERY_PERCENT on a qualifying session */
  mastered: boolean
  masteredAt?: number
  /** ms since epoch */
  lastPracticedAt: number
}

export interface MasteryFile {
  v: 1
  /** key: `${tool}:${itemId}` */
  records: Record<string, MasteryRecord>
}
