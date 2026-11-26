import { create } from 'zustand'
import { runSignature, useStore } from '../../store'

/** A press within this long of the last one does nothing. */
export const RUN_COOLDOWN_MS = 1000
/** How long Run stays lit. */
export const RUN_LIT_MS = 600

/** True for a moment after a press of Run has filled the table. */
export const useRunLit = create<{ lit: boolean }>(() => ({ lit: false }))

let lastPress = -Infinity
let timer: ReturnType<typeof setTimeout> | undefined

export const inRunCooldown = () => Date.now() - lastPress < RUN_COOLDOWN_MS

function setLit(lit: boolean) {
  clearTimeout(timer)
  useRunLit.setState({ lit })
  if (lit) timer = setTimeout(() => useRunLit.setState({ lit: false }), RUN_LIT_MS)
}

/**
 * The user asking for a run: the Run button or Ctrl/⌘+Enter. Every other run (page load, loading a preset, a changed
 * watch) calls the store's `run` directly, so it has no cooldown and doesn't light the button. Nothing happens until
 * Python is ready: a press while it loads is dropped, not queued.
 */
export async function pressRun(): Promise<void> {
  const before = useStore.getState()
  if (before.running || before.runnerStatus.state !== 'ready' || inRunCooldown()) return
  lastPress = Date.now()
  setLit(false)
  await before.run()
  const s = useStore.getState()
  // only for a new table, with rows, made by the program that is in the editor now
  if (s.result !== before.result && s.result?.status === 'ok' && s.result.steps.length > 0 && s.ranSig === runSignature(s)) {
    setLit(true)
  }
}

/** Forget the last press (tests). */
export function resetRunPress() {
  lastPress = -Infinity
  setLit(false)
}
