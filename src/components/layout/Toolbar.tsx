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

export function Toolbar() {
  const { language, run, cancel, running, runnerStatus, loadPreset } = useStore()
  const inChallenge = useStore((s) => s.challenge !== null)
  const presets = getLanguage(language).presets
  const notReady = runnerStatus.state !== 'ready' && runnerStatus.state !== 'running'

  return (
    <ToolHeader title="Trace Table Studio">
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
        >
▶ Run
        </Button>
      )}

      <label className="flex items-center gap-2 text-sm">
        <span className="text-slate-600 dark:text-slate-400">Example</span>
        <select
          value=""
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
