import type { Run, Step } from './types'

/**
 * How a card looks. The UI shows each as colour AND a text label, never colour alone.
 * `none` is an ordinary card.
 */
export type Mark =
  | 'none'
  | 'compare'
  | 'swap'
  | 'shift'
  | 'placed'
  | 'held'
  | 'active'
  | 'merged'
  | 'sorted'
  | 'mid'
  | 'found'
  | 'discarded'

export interface Card {
  /** Stable identity (the input position), so a card can slide to a new place and duplicates stay distinct. */
  id: number
  value: number
  /** Slot the card sits in. */
  pos: number
  /** Insertion sort: the key is held above the row while the others shift. */
  lifted: boolean
}

/** One visible moment of a run. `frames[0]` is the start; `frames[k]` is the state after `run.steps[k - 1]`. */
export interface Frame {
  /** Index into `run.steps` of the step that made this frame; -1 for the start. */
  step: number
  /** In id order (so the DOM order never changes and CSS transitions can slide cards). */
  cards: Card[]
  /** Indexed like `cards`. */
  marks: Mark[]
  caption: string
  /** Running totals up to and including this frame. */
  comparisons: number
  swaps: number
  shifts: number
  /** Passes (or merge levels) completed so far. */
  pass: number
}

const span = (low: number, high: number): string => (low === high ? `index ${low}` : `indices ${low} to ${high}`)

const list = (a: readonly number[]): string => `[${a.join(', ')}]`

/** The values in slot order. A held key (insertion sort) is not in any slot. */
export const frameValues = (frame: Frame): number[] =>
  frame.cards
    .filter((c) => !c.lifted)
    .sort((a, b) => a.pos - b.pos)
    .map((c) => c.value)

/**
 * Replays a run into one frame per step: where every card is, how it is marked and what to say.
 * Pure, so the visualiser, the history table and the quiz can all share one source of truth.
 */
export const buildFrames = (run: Run): Frame[] => {
  const n = run.input.length
  const sorting = run.algo === 'bubble' || run.algo === 'insertion' || run.algo === 'merge'

  // occupant[slot] = card id sitting there, or null for the gap an insertion-sort key left behind.
  const occupant: (number | null)[] = run.input.map((_, i) => i)
  const pos = run.input.map((_, i) => i)
  let held: number | null = null

  const sorted = new Set<number>() // slots known to be in their final place
  const merged = new Set<number>() // slots inside a finished merge run
  let discarded = new Set<number>() // slots ruled out by a search
  let comparisons = 0
  let swaps = 0
  let shifts = 0
  let pass = 0

  const frames: Frame[] = []

  const snapshot = (step: number, caption: string, transient: Map<number, Mark>, last: boolean): void => {
    const marks: Mark[] = run.input.map(() => 'none')
    const set = (slot: number, m: Mark) => {
      const id = occupant[slot]
      if (id !== null && id !== undefined) marks[id] = m
    }
    for (const s of discarded) set(s, 'discarded')
    for (const s of merged) set(s, 'merged')
    for (const s of sorted) set(s, 'sorted')
    if (last && sorting) for (let s = 0; s < n; s++) set(s, 'sorted')
    for (const [slot, m] of transient) set(slot, m)
    if (held !== null) marks[held] = 'held'
    frames.push({
      step,
      cards: run.input.map((value, id) => ({ id, value, pos: pos[id]!, lifted: id === held })),
      marks,
      caption,
      comparisons,
      swaps,
      shifts,
      pass,
    })
  }

  const place = (slot: number, id: number | null): void => {
    occupant[slot] = id
    if (id !== null) pos[id] = slot
  }

  snapshot(-1, 'Ready. Press Step or Play to begin.', new Map(), false)

  run.steps.forEach((s: Step, k) => {
    const transient = new Map<number, Mark>()
    let caption = ''
    switch (s.kind) {
      case 'compare': {
        comparisons++
        if (run.algo === 'insertion' && held === null) {
          // The key is lifted out of its slot as soon as it is first compared.
          held = occupant[s.j] ?? null
          occupant[s.j] = null
        }
        transient.set(s.i, 'compare')
        if (run.algo === 'bubble') {
          if (s.a > s.b) {
            caption = `Compare ${s.a} and ${s.b}: ${s.a} is bigger, so swap them.`
          } else {
            caption = `Compare ${s.a} and ${s.b}: already in order, so no swap.`
          }
          transient.set(s.j, 'compare')
        } else if (run.algo === 'insertion') {
          caption =
            s.a > s.b
              ? `Compare ${s.a} with the key ${s.b}: ${s.a} is bigger, so shift it right.`
              : `Compare ${s.a} with the key ${s.b}: ${s.a} is not bigger, so the key goes just after it.`
        } else {
          transient.set(s.j, 'compare')
          caption = `Compare ${s.a} and ${s.b}: ${s.a <= s.b ? `take the left one (${s.a})` : `take the right one (${s.b})`}.`
        }
        break
      }
      case 'swap': {
        swaps++
        const a = occupant[s.i] ?? null
        const b = occupant[s.j] ?? null
        place(s.i, b)
        place(s.j, a)
        transient.set(s.i, 'swap')
        transient.set(s.j, 'swap')
        caption = `Swap index ${s.i} and index ${s.j}.`
        break
      }
      case 'shift': {
        shifts++
        place(s.to, occupant[s.from] ?? null)
        occupant[s.from] = null
        transient.set(s.to, 'shift')
        caption = `Shift ${s.value} right to index ${s.to}.`
        break
      }
      case 'insert': {
        if (held !== null) place(s.index, held)
        held = null
        transient.set(s.index, 'placed')
        caption = `Insert the key ${s.value} at index ${s.index}.`
        break
      }
      case 'split': {
        for (let i = s.low; i <= s.high; i++) transient.set(i, 'active')
        caption = `Split ${span(s.low, s.high)} into ${span(s.low, s.mid)} and ${span(s.mid + 1, s.high)}.`
        break
      }
      case 'merge': {
        const before = occupant.slice()
        s.from.forEach((src, i) => place(s.low + i, before[src] ?? null))
        for (let i = s.low; i <= s.high; i++) merged.add(i)
        for (let i = s.low; i <= s.high; i++) transient.set(i, 'merged')
        caption = `Merge ${span(s.low, s.mid)} and ${span(s.mid + 1, s.high)} into ${list(s.result)}.`
        break
      }
      case 'inspect': {
        comparisons++
        discarded = new Set(Array.from({ length: s.i }, (_, i) => i))
        transient.set(s.i, 'compare')
        caption = s.match
          ? `Look at index ${s.i}: ${s.value} equals ${run.target}.`
          : `Look at index ${s.i}: ${s.value} is not ${run.target}, so move on.`
        break
      }
      case 'range': {
        comparisons++
        discarded = new Set()
        for (let i = 0; i < n; i++) if (i < s.low || i > s.high) discarded.add(i)
        transient.set(s.mid, 'mid')
        const where = `low ${s.low}, high ${s.high}, so middle is index ${s.mid}`
        if (s.relation === 'equal') caption = `${where}: ${s.value} equals the target ${run.target}.`
        else if (s.relation === 'less')
          caption = `${where}: ${s.value} is less than ${run.target}, so discard the left half and search right.`
        else caption = `${where}: ${s.value} is greater than ${run.target}, so discard the right half and search left.`
        break
      }
      case 'found': {
        transient.set(s.i, 'found')
        caption = `Found ${run.target} at index ${s.i}.`
        break
      }
      case 'not-found': {
        discarded = new Set(Array.from({ length: n }, (_, i) => i))
        caption = `Not found: ${run.target} is not in the list.`
        break
      }
      case 'pass-end': {
        pass = s.pass
        if (run.algo === 'bubble') for (let i = n - s.pass; i < n; i++) sorted.add(i)
        if (run.algo === 'insertion') for (let i = 0; i <= s.pass; i++) sorted.add(i)
        caption =
          run.algo === 'merge'
            ? `End of merge level ${s.pass}: ${list(s.array)}.`
            : `End of pass ${s.pass}: ${list(s.array)}.`
        break
      }
    }
    snapshot(k, caption, transient, k === run.steps.length - 1)
  })

  const last = frames[frames.length - 1]!
  if (sorting && run.steps.length > 0) last.caption = `${last.caption} Sorted.`
  return frames
}
