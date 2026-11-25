import { useLayoutEffect, useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router'

/**
 * Keeps the address bar in step with a tool's state, replacing the history entry.
 *
 * It writes when the state changes, or when the query has been stripped (the tool's own nav link). NOT merely because
 * `setParams` is new: it changes with every URL, including after our own write, and that render is deferred. One still
 * pending when another nav link is clicked would write this page's address over the new one.
 *
 * A LAYOUT effect for the same reason: a passive one can still be pending at the next click.
 */
export function useUrlMirror(params: Record<string, string> | URLSearchParams) {
  const [, setParams] = useSearchParams()
  const bare = useLocation().search === ''
  const query = new URLSearchParams(params).toString()
  const written = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (written.current === query && !(bare && query)) return
    written.current = query
    setParams(query, { replace: true })
  }, [query, bare, setParams])
}
