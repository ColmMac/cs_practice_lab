import { Loader2, Play } from 'lucide-react'
import type { ReactNode } from 'react'
import type { RunnerStatus } from '../../core/runner'
import { useStore } from '../../store'
import { Button } from '../ui/Button'
import { ICON_BEFORE } from '../ui/icons'
import { inRunCooldown, pressRun, useRunLit } from './runPress'

type Face = 'run' | 'loading' | 'unavailable' | 'cancel'

const FACES: Record<Face, ReactNode> = {
  run: (
    <>
      <Play aria-hidden="true" className={ICON_BEFORE} />
      Run
    </>
  ),
  loading: (
    <>
      <Loader2 aria-hidden="true" className={`${ICON_BEFORE} motion-safe:animate-spin`} />
      Loading Python…
    </>
  ),
  unavailable: 'Python unavailable',
  cancel: 'Cancel',
}

function faceFor(running: boolean, state: RunnerStatus['state']): Face {
  if (running) return 'cancel'
  if (state === 'failed') return 'unavailable'
  return state === 'ready' ? 'run' : 'loading'
}

/** Run, which is also Cancel while a program runs: ONE button, as wide as its longest label in every state. */
export function RunButton() {
  const running = useStore((s) => s.running)
  const cancel = useStore((s) => s.cancel)
  const state = useStore((s) => s.runnerStatus.state)
  const inChallenge = useStore((s) => s.challenge !== null)
  const lit = useRunLit((s) => s.lit)
  const face = faceFor(running, state)

  const title = {
    run: inChallenge ? 'Run is off during a challenge: use Start challenge or End challenge' : 'Run (Ctrl/⌘ + Enter)',
    loading: 'Run is available once Python has loaded',
    unavailable: 'Python failed to load: use Retry',
    cancel: 'Stop the running program',
  }[face]

  return (
    <Button
      variant={running ? 'danger' : 'primary'}
      // a quick second press of Run lands on Cancel (it is the same button), so the cooldown covers it too
      onClick={() => (running ? !inRunCooldown() && cancel() : void pressRun())}
      disabled={!running && (face !== 'run' || inChallenge)}
      title={title}
      data-lit={(!running && lit) || undefined}
      // lights up and fades back; only colour and glow change, so the toolbar holds still
      className="transition-[filter,box-shadow] duration-300 data-lit:ring-4 data-lit:ring-accent-fill/40 data-lit:brightness-135"
    >
      <span className="inline-grid justify-items-center">
        {(Object.keys(FACES) as Face[]).map((f) => (
          <span key={f} aria-hidden={f !== face || undefined} className={`col-start-1 row-start-1 ${f === face ? '' : 'invisible'}`}>
            {FACES[f]}
          </span>
        ))}
      </span>
    </Button>
  )
}
