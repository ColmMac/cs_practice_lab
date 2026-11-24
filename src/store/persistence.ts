import type { StateStorage } from 'zustand/middleware'
import { sanitizeSessions, type StudySessionData } from '../core/study/session'
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

/** What goes into localStorage: the workspace plus in-progress study sessions (5 most recent, by executionKey). */
export interface PersistedState extends Workspace {
  studySessions: Record<string, StudySessionData>
  /** oldest → newest */
  studyOrder: string[]
}

/** Merge for the persist middleware, including the saved study sessions. */
export function mergePersisted<T extends PersistedState>(persisted: unknown, current: T): T {
  const stored = typeof persisted === 'object' && persisted !== null ? (persisted as Record<string, unknown>) : {}
  return { ...mergeWorkspace(persisted, current), ...sanitizeSessions(stored.studySessions, stored.studyOrder) }
}

export { defaultWorkspace }
