/** mulberry32: tiny, fast, seedable PRNG. Same seed ⇒ same sequence, so masks reproduce across reloads and shares. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates shuffle of a copy. */
export function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/**
 * A seeded random share of the items: exactly `percent` of them (clamped to 0–100, rounded), and at least one when
 * any share is asked for. An exact count, not a coin flip per item.
 */
export function sampleShare<T>(items: readonly T[], percent: number, seed: number): T[] {
  const share = Math.min(100, Math.max(0, Math.round(percent)))
  if (items.length === 0 || share === 0) return []
  const count = Math.max(1, Math.round((items.length * share) / 100))
  return shuffled(items, mulberry32(seed)).slice(0, count)
}

/** A fresh random 32-bit seed (the only non-deterministic thing in Study Mode). */
export const newSeed = (): number => (Math.random() * 4294967296) >>> 0
