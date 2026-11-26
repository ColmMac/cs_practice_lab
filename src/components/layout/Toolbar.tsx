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
import { Play } from 'lucide-react'
import { ICON_BEFORE } from '../ui/icons'
import { shownPresetId } from './shownPreset'
import { inRunCooldown, pressRun, useRunLit } from './runPress'

export function Toolbar() {
  const { language, cancel, running, runnerStatus, loadPreset } = useStore()
  const inChallenge = useStore((s) => s.challenge !== null)
  const presets = getLanguage(language).presets
  const shownPreset = useStore((s) => shownPresetId(s, presets))
  const lit = useRunLit((s) => s.lit)
  const notReady = runnerStatus.state !== 'ready' && runnerStatus.state !== 'running'

  return (
    <ToolHeader title={SITE_NAME}>
      {running ? (
        // a quick second press of Run lands here (it is the same button), so the cooldown covers it too
        <Button variant="danger" onClick={() => !inRunCooldown() && cancel()}>
          Cancel
        </Button>
      ) : (
        <Button
          variant="primary"
          onClick={() => void pressRun()}
          disabled={notReady || inChallenge}
          title={inChallenge ? 'Run is off during a challenge: use Start challenge or End challenge' : 'Run (Ctrl/⌘ + Enter)'}
          data-lit={lit || undefined}
          // lights up and fades back; only colour and glow change, so the toolbar holds still
          className="transition-[filter,box-shadow] duration-300 data-lit:ring-4 data-lit:ring-accent-fill/40 data-lit:brightness-135"
        >
          <Play aria-hidden="true" className={ICON_BEFORE} />
          Run
        </Button>
      )}
      <span aria-live="polite" className="sr-only">
        {lit ? 'Program ran' : ''}
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
