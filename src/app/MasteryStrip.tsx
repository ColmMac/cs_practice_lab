import { Link } from 'react-router'
import { nextUnfinished, presetProgress } from '../core/mastery/mastery'
import { MASTERY_PERCENT } from '../core/mastery/types'
import { Button, BUTTON_CLASSES } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { resetMastery } from '../store/masteryStorage'
import { TRACE_PRESET_IDS, TRACE_PRESETS, useMastery } from './useMastery'

/** The home page's progress panel: how many trace presets are mastered, and what to practise next. */
export function MasteryStrip() {
  const file = useMastery()
  const progress = presetProgress(file, 'trace', TRACE_PRESET_IDS)
  const next = nextUnfinished(file, 'trace', TRACE_PRESET_IDS)
  const name = TRACE_PRESETS.find((p) => p.id === next?.id)?.name
  const anySaved = Object.keys(file.records).length > 0

  const reset = () => {
    if (window.confirm('Reset your progress? This forgets every score saved on this device and can’t be undone.')) resetMastery()
  }

  return (
    <Panel title="Your progress" className="mt-6 max-w-3xl">
      <div className="p-3 text-sm tabular-nums">
        <p className="font-medium">
          {progress.mastered}/{progress.total} trace presets mastered
        </p>
        <progress
          aria-label="Trace presets mastered"
          value={progress.mastered}
          max={progress.total}
          className="mt-2 block h-2 w-full appearance-none overflow-hidden rounded bg-surface-hover [&::-moz-progress-bar]:bg-accent-fill [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:bg-accent-fill"
        />
        <p className="mt-2 text-xs text-text-muted">
          Score {MASTERY_PERCENT}% or more in Study mode to master a preset, with at least half of its table filled in without
          Reveal. Saved only on this device.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {next && name && (
            <Link to={`/trace-table?preset=${next.id}&study=1`} className={`inline-block ${BUTTON_CLASSES.primary}`}>
              {next.revisit ? `Revisit ${name}` : `Practice next: ${name}`}
            </Link>
          )}
          {anySaved && (
            <Button variant="small" onClick={reset}>
              Reset my progress
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
}
