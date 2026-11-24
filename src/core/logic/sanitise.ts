import { MAX_LENGTH } from './ast'

/**
 * Clean an expression that came from a URL or storage: a string, no control characters other than
 * newline, at most MAX_LENGTH characters. Never trusted beyond this; the parser does the rest.
 */
export function sanitiseExpr(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return Array.from(raw.replace(/\r\n?/g, '\n'))
    .filter((ch) => {
      const c = ch.charCodeAt(0)
      return ch === '\n' || (c >= 0x20 && c !== 0x7f)
    })
    .join('')
    .slice(0, MAX_LENGTH)
}
