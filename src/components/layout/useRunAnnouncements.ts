import { useEffect, useRef } from 'react'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { announce, useAnnounce } from '../ui/announce'

/** One sentence about a finished run. The details are in the table and the error banner. */
export function runMessage(result: TraceResult): string {
  if (result.status === 'ok') return `Run finished: ${result.steps.length} step${result.steps.length === 1 ? '' : 's'}.`
  if (result.status === 'awaiting-input') return 'Run paused: the program needs more input.'
  if (result.status === 'cancelled') return 'Run cancelled.'
  return 'Run failed.'
}

/** Says when Python has loaded (or failed to), and how each run ended. */
export function useRunAnnouncements() {
  const state = useStore((s) => s.runnerStatus.state)
  const result = useStore((s) => s.result)

  // Only a load that was watched is news: `ready` also follows every run, and comes with a return to the page.
  // The first run starts at once, so `running` may be the first state seen after loading.
  const wasLoading = useRef(false)
  useEffect(() => {
    if (state === 'loading' || state === 'uninitialised') {
      wasLoading.current = true
    } else if (wasLoading.current) {
      wasLoading.current = false
      announce(state === 'failed' ? 'Python failed to load.' : 'Python ready')
    }
  }, [state])

  useAnnounce(result && runMessage(result), { on: result })
}
