import { useCallback, useSyncExternalStore } from 'react'

/** Tailwind's `lg` breakpoint: where the tool pages switch to two columns. */
export const WIDE_SCREEN = '(min-width: 1024px)'

const supported = () => typeof matchMedia === 'function'

/** Whether a media query matches, kept current. False where there is no `matchMedia`. */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!supported()) return () => {}
      const list = matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => supported() && matchMedia(query).matches)
}
