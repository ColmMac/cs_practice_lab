import { SITE_NAME } from '../../config/site'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { RuntimeStatusBadge } from './RuntimeStatusBadge'
import { ExportMenu } from '../export/ExportMenu'
import { StudyToggle } from '../study/StudyToggle'
import { ShareButton } from './ShareButton'
import { ChallengeLinkButton } from './ChallengeLinkButton'
import { ToolHeader } from '../ui/ToolHeader'
import { ProjectorToggle } from '../ui/ProjectorToggle'
import { shownPresetId } from './shownPreset'
import { RunButton } from './RunButton'
import { useRunAnnouncements } from './useRunAnnouncements'

export function Toolbar() {
  const { language, loadPreset } = useStore()
  const presets = getLanguage(language).presets
  const shownPreset = useStore((s) => shownPresetId(s, presets))
  useRunAnnouncements()

  return (
    <ToolHeader title={SITE_NAME}>
      <RunButton />

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
