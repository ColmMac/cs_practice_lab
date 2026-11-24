import type { LanguageId, TraceOptions } from './types'

/** cyrb53: small, fast, well-distributed non-crypto string hash. */
export function hashString(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

/** Identifies one deterministic execution: same key ⇒ same ground-truth trace. Keys study sessions. */
export function executionKey(language: LanguageId, code: string, options: TraceOptions): string {
  return hashString(
    JSON.stringify([
      language,
      code,
      options.stdin,
      options.watches.filter((w) => w.enabled).map((w) => [w.id, w.expr, w.scope]),
      options.randomSeed,
      options.maxSteps,
      options.maxCallDepth,
      options.valueLimits,
      options.showCallables,
    ]),
  )
}
