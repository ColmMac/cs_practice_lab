import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { parseShareHash } from '../core/share/urlState'
import { getLanguage } from '../languages/registry'
import { useStore } from '../store'

/** The built-in a `?preset=` may load, or null: an unknown id is ignored, and a share link under review is left alone. */
function loadablePreset(id: string | null): string | null {
  const st = useStore.getState()
  // A share link may not have been opened yet, so look at the fragment too.
  if (id === null || st.shared || parseShareHash(window.location.hash)) return null
  return getLanguage(st.language).presets.some((p) => p.id === id) ? id : null
}

/**
 * `?preset=<built-in id>` on the trace page (home-page links): load and run that built-in example, then drop the
 * parameter. With `&study=1` it opens as a study session. Built-ins are our own safe code, never user code.
 *
 * Returns true while a study link is waiting to be handled: the page must show no table until then, because the
 * one left over from earlier could be this preset's, with every answer on it.
 */
export function usePresetParam(): boolean {
  const [params, setParams] = useSearchParams()
  const handled = useRef(false)
  const preset = params.get('preset')
  const study = params.get('study')
  useEffect(() => {
    if (preset === null && study === null) {
      handled.current = false
      return
    }
    if (handled.current) return
    handled.current = true
    const id = loadablePreset(preset)
    if (id !== null) useStore.getState().loadPreset(id, { study: study === '1' })
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('preset')
        next.delete('study')
        return next
      },
      { replace: true },
    )
  }, [preset, study, setParams])
  return study === '1' && loadablePreset(preset) !== null
}
