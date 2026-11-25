import { emptyMastery, recordAttempt, sanitizeMastery, type Attempt } from '../core/mastery/mastery'
import { MASTERY_KEY, type MasteryFile } from '../core/mastery/types'

// The only code that touches `hub:mastery:v1`. It does not import the trace store, so the home page can use it
// without loading the trace tool.

const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

function readRaw(): string | null {
  try {
    return localStorage.getItem(MASTERY_KEY)
  } catch {
    return null // storage blocked
  }
}

function parse(raw: string | null): unknown {
  if (raw === null) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

let cache: { raw: string | null; file: MasteryFile } = { raw: null, file: emptyMastery() }

/** The stored progress, cleaned. The same object comes back until the stored text changes (a stable snapshot). */
export function readMastery(): MasteryFile {
  const raw = readRaw()
  if (raw !== cache.raw) cache = { raw, file: sanitizeMastery(parse(raw), Date.now()) }
  return cache.file
}

/** A file written by a newer version of the app: ignored, and never overwritten. */
function isFromTheFuture(raw: string | null): boolean {
  const v = (parse(raw) as { v?: unknown } | null)?.v
  return typeof v === 'number' && v > 1
}

/** Read, add, write: always from what is stored NOW, so a second tab's progress isn't lost. */
export function saveAttempt(attempt: Attempt): void {
  if (isFromTheFuture(readRaw())) return
  const next = recordAttempt(readMastery(), attempt, Date.now())
  try {
    localStorage.setItem(MASTERY_KEY, JSON.stringify(next))
  } catch {
    return // blocked or full: the app keeps working, it just won't remember
  }
  notify()
}

export function resetMastery(): void {
  try {
    localStorage.removeItem(MASTERY_KEY)
  } catch {
    return
  }
  notify()
}

/** Changes made here, and (through the `storage` event) in other tabs. */
export function subscribeMastery(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === MASTERY_KEY || e.key === null) listener()
  }
  listeners.add(listener)
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}
