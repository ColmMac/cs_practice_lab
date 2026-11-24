import type { StateStorage } from 'zustand/middleware'
import { defaultWorkspace, sanitizeWorkspace, type Workspace } from '../core/workspace'

export const STORAGE_KEY = 'tts:v1'
export const STORAGE_VERSION = 1

/** localStorage can be missing, blocked or full (private windows, disabled site data): never throw. */
export const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* quota / blocked: the app keeps working, it just won't remember */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

/**
 * Upgrades persisted data from older schema versions. v1 is current, so today this only defends
 * against unknown (newer or garbage) versions by discarding them.
 */
export function migrateWorkspace(persisted: unknown, version: number): unknown {
  if (version === STORAGE_VERSION) return persisted
  return undefined // unknown version: start clean rather than guess
}

/** Merge for the persist middleware: untrusted stored data over the current defaults, field by field. */
export function mergeWorkspace<T extends Workspace>(persisted: unknown, current: T): T {
  return { ...current, ...sanitizeWorkspace(persisted, current) }
}

export { defaultWorkspace }
