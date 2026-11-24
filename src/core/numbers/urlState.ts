/**
 * URL state for the Number Systems page (N3.5). Everything here is untrusted input from a link,
 * so each value is checked and anything odd falls back to a default.
 */
import { fromBinary, toBinary, type Bits, type Width } from './bits'
import type { QuestionKind } from './practice'

export const MODES = ['sandbox', 'add', 'practice'] as const
export type Mode = (typeof MODES)[number]

/** Practice topics: `?topic=` narrows the questions to one family (cycled to fill the eight). */
export const TOPICS = {
  convert: { label: 'Denary and binary', kinds: ['dec2bin', 'bin2dec'] },
  hex: { label: 'Binary and hex', kinds: ['bin2hex', 'hex2bin'] },
  twos: { label: 'Two’s complement', kinds: ['neg2twos', 'twos2dec'] },
  add: { label: 'Addition and overflow', kinds: ['add', 'overflow'] },
} as const satisfies Record<string, { label: string; kinds: readonly QuestionKind[] }>
export type Topic = keyof typeof TOPICS

export interface NumberUrlState {
  mode: Mode
  width: Width
  /** The sandbox register, already the right length for `width`; null when the link did not give one. */
  bits: Bits | null
  topic: Topic | null
  seed: number | null
  /** Addition operands from `?a=` / `?b=` (binary, right-aligned to `width`); null when absent or invalid. */
  a: Bits | null
  b: Bits | null
}

const get = (params: URLSearchParams, key: string): string => (params.get(key) ?? '').slice(0, 64)

export function parseNumberUrl(params: URLSearchParams): NumberUrlState {
  const m = get(params, 'mode')
  const mode: Mode = (MODES as readonly string[]).includes(m) ? (m as Mode) : 'sandbox'

  const binary = (key: string): string | null => {
    const v = get(params, key).replace(/^0b/i, '')
    return /^[01]+$/.test(v) && v.length <= 16 ? v : null
  }
  const rawBits = binary('bits')
  const rawA = binary('a')
  const rawB = binary('b')
  const bitsOk = rawBits !== null
  // An explicit width wins; otherwise a 9 to 16 digit register or operand means 16-bit.
  const w = get(params, 'width')
  const longest = Math.max(rawBits?.length ?? 0, rawA?.length ?? 0, rawB?.length ?? 0)
  const width: Width = w === '16' ? 16 : w === '8' ? 8 : longest > 8 ? 16 : 8
  const fitBits = (v: string | null): Bits | null => (v === null ? null : fromBinary(v.slice(-width).padStart(width, '0'), width))
  const bits = bitsOk ? fitBits(rawBits) : null

  const t = get(params, 'topic')
  const topic = Object.hasOwn(TOPICS, t) ? (t as Topic) : null

  const s = get(params, 'seed')
  const seed = /^\d{1,10}$/.test(s) && Number(s) <= 4294967295 ? Number(s) : null

  return { mode, width, bits, topic, seed, a: fitBits(rawA), b: fitBits(rawB) }
}

/** The query string for the current state; defaults are left out so a plain page keeps a plain URL. */
export function numberUrlParams(state: {
  mode: Mode
  width: Width
  bits: Bits
  topic: Topic | null
  seed: number
}): Record<string, string> {
  const out: Record<string, string> = {}
  if (state.mode !== 'sandbox') out.mode = state.mode
  if (state.mode === 'practice') {
    if (state.topic) out.topic = state.topic
    out.seed = String(state.seed)
    return out
  }
  if (state.width !== 8) out.width = String(state.width)
  if (state.mode === 'sandbox' && state.bits.some((b) => b === 1)) out.bits = toBinary(state.bits)
  return out
}
