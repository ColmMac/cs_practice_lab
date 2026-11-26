import { useEffect, useRef, useSyncExternalStore } from 'react'

/**
 * Screen-reader announcements. Pages call `announce` (usually through `useAnnounce`); the one <LiveRegion> in the
 * app shell reads them out. Plain module state, so the home page's chunk gains no store.
 */
export interface Announcement {
  id: number
  text: string
}

/** How long a message stays in the region. Removing it is silent. */
export const ANNOUNCEMENT_MS = 5000
const KEEP = 4

let items: readonly Announcement[] = []
let nextId = 0
const listeners = new Set<() => void>()

function set(next: readonly Announcement[]) {
  items = next
  listeners.forEach((l) => l())
}

/** Each message is a new node, so two in a row are both read and a repeat is read again. */
export function announce(text: string) {
  if (!text) return
  const id = ++nextId
  set([...items.slice(1 - KEEP), { id, text }])
  setTimeout(() => set(items.filter((i) => i.id !== id)), ANNOUNCEMENT_MS)
}

/** Empty the region (tests). */
export function resetAnnouncements() {
  set([])
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export const useAnnouncements = () => useSyncExternalStore(subscribe, () => items)

const NOTHING = Symbol('nothing announced')

interface Options {
  /** Wait for the text to hold still this long: use it for anything that follows typing or playback. */
  delay?: number
  /** Announce when THIS changes rather than the text, so the same words about a new thing are read again. */
  on?: unknown
  /** Also read what is there on mount (for something that appears because of what the user just did). */
  initial?: boolean
}

/** Announces `text` when it changes. What is on screen when the component mounts is not read unless `initial`. */
export function useAnnounce(text: string | null | undefined, { delay = 0, on, initial = false }: Options = {}) {
  const key = on === undefined ? text : on
  const last = useRef<unknown>(initial ? NOTHING : key)
  useEffect(() => {
    if (key === last.current) return
    const timer = setTimeout(() => {
      last.current = key
      if (text) announce(text)
    }, delay)
    return () => clearTimeout(timer)
  }, [key, text, delay])
}
