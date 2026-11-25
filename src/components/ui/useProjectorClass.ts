import { useLayoutEffect } from 'react'
import { PROJECTOR_CLASS, useProjector } from './projector'

/** Puts the projector class on <html> while the calling page is mounted, so no other page is ever affected. */
export function useProjectorClass() {
  const on = useProjector((s) => s.on)
  useLayoutEffect(() => {
    if (!on) return
    document.documentElement.classList.add(PROJECTOR_CLASS)
    return () => document.documentElement.classList.remove(PROJECTOR_CLASS)
  }, [on])
}
