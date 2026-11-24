import { fromBinary, fromHex, fromSigned, fromUnsigned, NumberError, type Bits, type Width } from './bits'

export type NumberBase = 'bin' | 'hex' | 'unsigned' | 'signed'

export type ParseResult =
  | { ok: true; bits: Bits; /** Binary only: fewer digits than the width were typed. */ padded: boolean }
  | { ok: false; message: string }

const MAX_INPUT = 64

const fail = (message: string): ParseResult => ({ ok: false, message })

/**
 * Tolerant parse of what a student types. Accepts spaces and underscores as
 * separators, and the usual prefixes/suffixes: `0b`, `%`, trailing `b` for binary;
 * `0x`, `&`, `#`, trailing `h` for hex. Reports width overflow instead of truncating.
 */
export function parseNumberInput(raw: string, base: NumberBase, width: Width): ParseResult {
  if (raw.length > MAX_INPUT) return fail('That is too long.')
  let text = raw.replace(/[\s_]/g, '')
  if (text === '') return fail('Type a number.')
  try {
    if (base === 'bin') {
      text = text.replace(/^(0b|%)/i, '')
      if (/^[01]+b$/i.test(text)) text = text.slice(0, -1)
      if (!/^[01]+$/.test(text)) return fail('Binary uses only the digits 0 and 1.')
      const significant = text.replace(/^0+/, '')
      if (significant.length > width) return fail(`That needs more than ${width} bits.`)
      const padded = text.length < width
      const full = text.length > width ? text.slice(text.length - width) : text.padStart(width, '0')
      return { ok: true, bits: fromBinary(full, width), padded }
    }
    if (base === 'hex') {
      text = text.replace(/^(0x|&|#)/i, '')
      if (/^[0-9a-f]+h$/i.test(text)) text = text.slice(0, -1)
      return { ok: true, bits: fromHex(text, width), padded: false }
    }
    if (!/^[+-]?\d+$/.test(text)) return fail('Type a whole number in denary.')
    if (base === 'unsigned' && text.startsWith('-')) {
      return fail('Unsigned numbers cannot be negative.')
    }
    const n = Number(text)
    if (!Number.isSafeInteger(n)) return fail('That number is too big.')
    return {
      ok: true,
      bits: base === 'signed' ? fromSigned(n, width) : fromUnsigned(n, width),
      padded: false,
    }
  } catch (e) {
    if (e instanceof NumberError) return fail(e.message)
    throw e
  }
}
