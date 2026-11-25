import { useEffect, useState } from 'react'
import { useStore } from '../../store'

/** How long the "it ran" cue stays up. */
export const JUST_RAN_MS = 2500

/**
 * True for a moment after a run finishes without an error. On a phone the table is below the fold, so without this
 * nothing near the Run button changes. It goes away on its own, and at once if another run starts or the program
 * or its input changes.
 */
export function useJustRan(): boolean {
  const [justRan, setJustRan] = useState(false)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const show = (on: boolean) => {
      clearTimeout(timer)
      setJustRan(on)
      if (on) timer = setTimeout(() => setJustRan(false), JUST_RAN_MS)
    }
    const unsubscribe = useStore.subscribe((s, prev) => {
      if (s.result !== prev.result && s.result?.status === 'ok') show(true)
      else if ((s.running && !prev.running) || s.code !== prev.code || s.stdinText !== prev.stdinText) show(false)
    })
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [])
  return justRan
}
