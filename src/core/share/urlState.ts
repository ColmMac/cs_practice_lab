import LZString from 'lz-string'
import { DEFAULT_TRACE_OPTIONS } from '../types'
import { defaultWorkspace, sanitizeWorkspace, type Workspace } from '../workspace'

/** Hash key: `https://host/#s=<payload>` */
export const SHARE_KEY = 's='
/** Chat apps and some browsers truncate long URLs; warn the sender above this. */
export const SHARE_URL_WARN_LENGTH = 8000
/**
 * Largest payload we will even try to decompress. LZ expansion is roughly quadratic (a 2.8 kB payload can
 * inflate to 1.5 MB), so an unbounded hostile link could freeze the tab. Real programs compress to ~1-2 kB.
 */
export const MAX_SHARE_PAYLOAD = 12_000
const MAX_DECODED_JSON = 400_000
const SCHEMA_VERSION = 1
const EXECUTION_KEY = /^[0-9a-z]{1,16}$/

export type ShareMode = 'workspace' | 'quiz'

/** What the teacher's run produced, so the student's device can tell it reproduced the same table. */
export interface ChallengeSpec {
  /** TraceResult.steps.length of the teacher's run */
  steps: number
  /** executionKey of the teacher's run */
  executionKey: string
}

export interface DecodedShare {
  workspace: Workspace
  mode: ShareMode
  /** Present only when mode is 'quiz' AND the spec was well-formed. */
  challenge?: ChallengeSpec
}

/**
 * A challenge adds `mode` and `ch` to the ordinary payload (the schema stays v1: an older app ignores them and
 * opens a plain shared workspace, which is a safe fallback).
 */
export function encodeShare(ws: Workspace, quiz?: ChallengeSpec): string {
  const extra = quiz ? { mode: 'quiz', ch: { n: quiz.steps, ek: quiz.executionKey } } : {}
  return LZString.compressToEncodedURIComponent(JSON.stringify({ v: SCHEMA_VERSION, ...ws, ...extra }))
}

function decodeSpec(v: unknown): ChallengeSpec | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined
  const { n, ek } = v as Record<string, unknown>
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > DEFAULT_TRACE_OPTIONS.maxSteps) return undefined
  if (typeof ek !== 'string' || !EXECUTION_KEY.test(ek)) return undefined
  return { steps: n, executionKey: ek }
}

/** Returns the sanitised contents of a share link, or null if the payload is not a usable one. Never throws. */
export function decodeShare(payload: string): DecodedShare | null {
  try {
    if (!payload || payload.length > MAX_SHARE_PAYLOAD) return null
    const json = LZString.decompressFromEncodedURIComponent(payload)
    if (!json || json.length > MAX_DECODED_JSON) return null
    const raw: unknown = JSON.parse(json)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const o = raw as Record<string, unknown>
    if (o.v !== SCHEMA_VERSION) return null // future / unknown schema: refuse rather than guess
    if (typeof o.code !== 'string' || o.code.length === 0) return null
    const workspace = sanitizeWorkspace(o, defaultWorkspace())
    if (o.mode !== 'quiz') return { workspace, mode: 'workspace' }
    const challenge = decodeSpec(o.ch)
    return challenge ? { workspace, mode: 'quiz', challenge } : { workspace, mode: 'quiz' }
  } catch {
    return null
  }
}

/** `#s=abc` or `s=abc` → `abc`; anything else → null. */
export function parseShareHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  return h.startsWith(SHARE_KEY) && h.length > SHARE_KEY.length ? h.slice(SHARE_KEY.length) : null
}

export interface ShareUrl {
  url: string
  length: number
  /** Long enough that some chat apps may cut it off. */
  tooLong: boolean
}

function toUrl(base: string, payload: string): ShareUrl {
  const url = `${base.split('#')[0]}#${SHARE_KEY}${payload}`
  return { url, length: url.length, tooLong: url.length > SHARE_URL_WARN_LENGTH }
}

export function buildShareUrl(base: string, ws: Workspace): ShareUrl {
  return toUrl(base, encodeShare(ws))
}

/** `unreadable`: the payload is over the size the app will open, so the link must not be handed out. */
export function buildChallengeUrl(base: string, ws: Workspace, spec: ChallengeSpec): ShareUrl & { unreadable: boolean } {
  const payload = encodeShare(ws, spec)
  return { ...toUrl(base, payload), unreadable: payload.length > MAX_SHARE_PAYLOAD }
}
