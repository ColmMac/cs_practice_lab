import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import { parseShareHash } from '../core/share/urlState'
import { getLanguage } from '../languages/registry'
import { useStore } from '../store'

/**
 * `?preset=<built-in id>` on the trace page (home-page quick starts): load and run that built-in example,
 * then drop the parameter. Built-ins are our own safe code, never user code; an unknown id is ignored, and a
 * share link under review is left alone.
 */
export function usePresetParam() {
  const [params, setParams] = useSearchParams()
  const handled = useRef(false)
  useEffect(() => {
    const id = params.get('preset')
    if (id === null || handled.current) return
    handled.current = true
    const st = useStore.getState()
    // A share link is only opened by App's init(), which runs after this, so look at the fragment too.
    if (!st.shared && !parseShareHash(window.location.hash) && getLanguage(st.language).presets.some((p) => p.id === id)) st.loadPreset(id)
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('preset')
        return next
      },
      { replace: true },
    )
  }, [params, setParams])
}
