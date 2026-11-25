import { SITE_NAME } from '../../config/site'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { RuntimeStatusBadge } from './RuntimeStatusBadge'
import { ExportMenu } from '../export/ExportMenu'
import { StudyToggle } from '../study/StudyToggle'
import { ShareButton } from './ShareButton'
import { ChallengeLinkButton } from './ChallengeLinkButton'
import { Button } from '../ui/Button'
import { ToolHeader } from '../ui/ToolHeader'
import { ProjectorToggle } from '../ui/ProjectorToggle'
import { Check, Play } from 'lucide-react'
import { ICON_BEFORE } from '../ui/icons'
import { shownPresetId } from './shownPreset'
import { useJustRan } from './useJustRan'

export function Toolbar() {
  const { language, run, cancel, running, runnerStatus, loadPreset } = useStore()
  const inChallenge = useStore((s) => s.challenge !== null)
  const presets = getLanguage(language).presets
  const shownPreset = useStore((s) => shownPresetId(s, presets))
  const justRan = useJustRan()
  const notReady = runnerStatus.state !== 'ready' && runnerStatus.state !== 'running'

  return (
    <ToolHeader title={SITE_NAME}>
      {running ? (
        <Button variant="danger" onClick={cancel}>
          Cancel
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => void run()}
          disabled={notReady || inChallenge}
          title={inChallenge ? 'Run is off during a challenge: use Start challenge or End challenge' : 'Run (Ctrl/⌘ + Enter)'}
          className="relative"
        >
          {/* the same size either way, so the toolbar holds still */}
          {justRan ? <Check aria-hidden="true" className={ICON_BEFORE} /> : <Play aria-hidden="true" className={ICON_BEFORE} />}
          Run
          {justRan && (
            <span aria-hidden="true" data-testid="ran-light" className="pointer-events-none absolute -top-1.5 -right-1.5 size-3.5">
              {/* three pulses, then the light stays still until it goes */}
              <span className="absolute inset-0 rounded-full bg-ran-light motion-safe:animate-[ping_0.8s_ease-out_3]" />
              <span className="absolute inset-0 rounded-full border-2 border-bg bg-ran-light" />
            </span>
          )}
        </Button>
      )}
      <span aria-live="polite" className="sr-only">
        {justRan ? 'Program ran' : ''}
      </span>

      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Example</span>
        <select
          value={shownPreset}
          onChange={(e) => e.target.value && loadPreset(e.target.value)}
          className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <option value="">Load a preset…</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
            </option>
          ))}
        </select>
      </label>

      <StudyToggle />
      <ProjectorToggle />

      <div className="ml-auto flex flex-wrap items-center gap-3">
        <RuntimeStatusBadge />
        <ExportMenu />
        <ChallengeLinkButton />
        <ShareButton />
      </div>
    </ToolHeader>
  )
}
