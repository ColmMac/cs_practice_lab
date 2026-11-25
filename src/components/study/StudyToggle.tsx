import { getLanguage } from '../../languages/registry'
import { runSignature, useStore } from '../../store'
import { StudyModeButton } from '../ui/StudyModeButton'

/** The prominent switch that turns the table into a self-test. */
export function StudyToggle() {
  const study = useStore((s) => s.study)
  const { startStudy, exitStudy } = useStore()
  const hasRows = useStore((s) => (s.result?.steps.length ?? 0) > 0)
  const stale = useStore((s) => s.result !== null && s.ranSig !== runSignature(s))
  const running = useStore((s) => s.running)
  const inChallenge = useStore((s) => s.challenge !== null)
  const supported = useStore((s) => (s.result ? !!getLanguage(s.result.language).parseAnswer : true))

  const on = study !== null
  const blocked = inChallenge || (!on && (!hasRows || stale || running || !supported))

  const toggle = () => {
    if (on) return exitStudy()
    startStudy()
    // Straight to the first answer box, so a keyboard user can start typing without tabbing through the page.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>('input[data-study-key]')?.focus())
  }
  const why = !supported
    ? 'Study mode isn’t available for this language yet.'
    : !hasRows
      ? 'Run a program that produces a table first.'
      : stale || running
        ? 'Run the current program first.'
        : 'Hide the answers and fill the trace table in yourself.'

  return (
    <StudyModeButton
      on={on}
      onClick={toggle}
      disabled={blocked}
      title={inChallenge ? 'A challenge is on: use End challenge to leave it' : on ? 'Leave study mode' : why}
    />
  )
}
