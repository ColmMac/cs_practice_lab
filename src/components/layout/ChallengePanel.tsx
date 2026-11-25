import { useStore } from '../../store'
import { Button } from '../ui/Button'

const BOX = 'rounded border p-4 text-sm'
const NEUTRAL = `${BOX} border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100`
const WARNING = `${BOX} border-amber-400 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100`

function EndButton() {
  const endChallenge = useStore((s) => s.endChallenge)
  return <Button onClick={endChallenge}>End challenge</Button>
}

/**
 * Stands where the table would be until a challenge's masked table is ready, so an unmasked one never renders.
 * Nothing runs until Start challenge is pressed.
 */
export function ChallengePanel() {
  const stage = useStore((s) => s.challenge?.stage)
  const status = useStore((s) => s.runnerStatus)
  const runStatus = useStore((s) => s.result?.status)
  const lines = useStore((s) => s.code.split('\n').length)
  const { startChallenge, showChallengeTable, retryRuntime } = useStore()

  if (stage === 'unreproducible') {
    return (
      <section role="region" aria-label="Student challenge" className={WARNING}>
        <div role="alert">
          <h2 className="font-semibold">This challenge didn’t produce the same table on this device</h2>
          <p className="mt-1">
            {runStatus && runStatus !== 'ok'
              ? 'The program didn’t run to the end.'
              : 'The program, its inputs or this app may differ from what the link was made with.'}{' '}
            Ask whoever sent the link for a new one, or look at the table this device produced.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" onClick={showChallengeTable}>
            Show the table anyway
          </Button>
          <EndButton />
        </div>
      </section>
    )
  }

  const starting = stage === 'starting'
  const failed = status.state === 'failed'
  const ready = status.state === 'ready' || status.state === 'running'
  return (
    <section role="region" aria-label="Student challenge" className={NEUTRAL}>
      <h2 className="font-semibold">Student challenge</h2>
      <p className="mt-1">
        This link holds a trace-table challenge ({lines} line{lines === 1 ? '' : 's'} of code). <strong>Nothing has been run.</strong>{' '}
        Read the code first. Start challenge runs it on this device and opens the table with cells hidden for you to fill in.
      </p>
      <p className="mt-1">
        During the challenge, exports and printing are off, and Reveal unlocks after your first Check answers. Your own workspace is
        kept safe: End challenge brings it back.
      </p>
      {failed ? (
        <p role="alert" className="mt-2 font-medium">
          Python couldn’t be loaded, so the challenge can’t start. Check your internet connection and try again.
        </p>
      ) : (
        <p role="status" className="mt-2 text-xs">
          {starting ? 'Running the program…' : ready ? 'Ready to start.' : 'Getting Python ready…'}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {failed ? (
          <Button variant="primary" onClick={() => void retryRuntime()}>
            Try again
          </Button>
        ) : (
          <Button variant="primary" onClick={startChallenge} disabled={starting || !ready}>
            Start challenge
          </Button>
        )}
        <EndButton />
      </div>
    </section>
  )
}
