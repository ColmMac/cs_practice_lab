import type { TraceRunner } from '../core/runner'
import type { LanguageId } from '../core/types'
import { getLanguage } from '../languages/registry'

const runners = new Map<LanguageId, TraceRunner>()
let override: TraceRunner | null = null

/** One runner per language, created lazily (the Python one starts loading Pyodide on first use). */
export function getRunner(language: LanguageId): TraceRunner {
  if (override) return override
  let r = runners.get(language)
  if (!r) {
    r = getLanguage(language).createRunner()
    runners.set(language, r)
  }
  return r
}

/** Test seam: make every language use this runner (pass null to restore). */
export function setRunnerOverride(r: TraceRunner | null) {
  override = r
  runners.clear()
}
