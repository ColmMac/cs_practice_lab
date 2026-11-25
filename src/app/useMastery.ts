import { useSyncExternalStore } from 'react'
import type { MasteryFile } from '../core/mastery/types'
import manifest from '../languages/python/presets/presets.json'
import { readMastery, subscribeMastery } from '../store/masteryStorage'

/** The trace presets as the home page needs them: only the metadata, never the programs or the trace store. */
export const TRACE_PRESETS: readonly { id: string; name: string }[] = manifest.map((p) => ({
  id: p.id,
  // 'Linear search (while + flag)' → 'Linear search': the technique hint belongs in the example picker
  name: p.title.replace(/ \([^()]*\)$/, ''),
}))

export const TRACE_PRESET_IDS: readonly string[] = TRACE_PRESETS.map((p) => p.id)

/** Saved progress, kept current across tabs. */
export const useMastery = (): MasteryFile => useSyncExternalStore(subscribeMastery, readMastery)
