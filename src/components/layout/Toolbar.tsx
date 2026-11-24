import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { RuntimeStatusBadge } from './RuntimeStatusBadge'

export function Toolbar() {
  const { language, run, cancel, running, runnerStatus, loadPreset, theme, toggleTheme } = useStore()
  const presets = getLanguage(language).presets
  const notReady = runnerStatus.state !== 'ready' && runnerStatus.state !== 'running'

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-slate-300 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-900">
      <h1 className="mr-2 text-base font-semibold">Trace Table Studio</h1>

      {running ? (
        <button
          type="button"
          onClick={cancel}
          className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
        >
          Cancel
        </button>
      ) : (
        <button
          type="button"
          onClick={() => void run()}
          disabled={notReady}
          title="Run (Ctrl/⌘ + Enter)"
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          ▶ Run
        </button>
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

      <div className="ml-auto flex items-center gap-3">
        <RuntimeStatusBadge />
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? '☀ Light' : '☾ Dark'}
        </button>
      </div>
    </header>
  )
}
