import LZString from 'lz-string'
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

export function encodeShare(ws: Workspace): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify({ v: SCHEMA_VERSION, ...ws }))
}

/** Returns a sanitised workspace, or null if the payload is not a usable share link. Never throws. */
export function decodeShare(payload: string): Workspace | null {
  try {
    if (!payload || payload.length > MAX_SHARE_PAYLOAD) return null
    const json = LZString.decompressFromEncodedURIComponent(payload)
    if (!json || json.length > MAX_DECODED_JSON) return null
    const raw: unknown = JSON.parse(json)
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
    const o = raw as Record<string, unknown>
    if (o.v !== SCHEMA_VERSION) return null // future / unknown schema: refuse rather than guess
    if (typeof o.code !== 'string' || o.code.length === 0) return null
    return sanitizeWorkspace(o, defaultWorkspace())
  } catch {
    return null
  }
}

/** `#s=abc` or `s=abc` → `abc`; anything else → null. */
export function parseShareHash(hash: string): string | null {
  const h = hash.startsWith('#') ? hash.slice(1) : hash
  return h.startsWith(SHARE_KEY) && h.length > SHARE_KEY.length ? h.slice(SHARE_KEY.length) : null
}

export function buildShareUrl(base: string, ws: Workspace): { url: string; length: number; tooLong: boolean } {
  const url = `${base.split('#')[0]}#${SHARE_KEY}${encodeShare(ws)}`
  return { url, length: url.length, tooLong: url.length > SHARE_URL_WARN_LENGTH }
}
