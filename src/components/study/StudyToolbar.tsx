import { useMemo } from 'react'
import { columnLabel } from '../../core/derive/columns'
import { summarise } from '../../core/study/score'
import type { MaskMode } from '../../core/study/types'
import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { Segmented } from '../table/Segmented'
import { ScoreBar } from './ScoreBar'
import { useStudyModel } from './useStudyModel'

const btn =
  'rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'

/** Controls for a study session: what to hide, Check answers, and the score. */
export function StudyToolbar({ result }: { result: TraceResult }) {
  const study = useStore((s) => s.study)
  const { setStudyConfig, checkAnswers, resetAnswers, reshuffleStudy, exitStudy } = useStore()
  const model = useStudyModel(result)

  const askable = useMemo(() => {
    if (!study || !model) return []
    const ids = new Set(model.cells.map((c) => c.colId))
    return study.columns.filter((c) => ids.has(c.id))
  }, [study, model])

  const score = useMemo(() => {
    if (!study || !model || !study.graded) return null
    const header = new Map(study.columns.map((c) => [c.id, columnLabel(c)]))
    return summarise(model.masked, study.graded, study.revealed, study.config.closeCredit, (id) => header.get(id) ?? id)
  }, [study, model])

  if (!study || !model) return null
  const { config } = study
  const revealed = model.masked.filter((c) => study.revealed[c.key]).length

  return (
    <section aria-label="Study mode" className="mb-3 rounded border border-emerald-700/40 bg-emerald-50/60 p-3 text-sm dark:bg-emerald-950/30">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-semibold">Study mode</h2>
        <p className="text-xs text-slate-700 dark:text-slate-300" role="status">
          {model.masked.length === 0
            ? 'Nothing is hidden: choose what to mask.'
            : `${model.masked.length} of ${model.cells.length} cells to fill in${revealed ? ` (${revealed} revealed)` : ''}`}
        </p>
        <button type="button" className={`${btn} ml-auto`} onClick={exitStudy}>
          Exit study mode
        </button>
      </div>

      {study.resumed && (
        <p className="mt-2 text-xs text-sky-900 dark:text-sky-200">
          Your saved answers for this exact program were restored. <button type="button" className="underline" onClick={resetAnswers}>Start over</button>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <Segmented<MaskMode>
          label="Hide"
          value={config.maskMode}
          onChange={(maskMode) => setStudyConfig({ maskMode })}
          options={[
            { value: 'all', label: 'All cells', hint: 'Every value the program writes' },
            { value: 'random', label: 'Random', hint: 'A random share of them' },
            { value: 'columns', label: 'Some columns', hint: 'Only the columns you choose' },
          ]}
        />
        {config.maskMode === 'random' && (
          <label className="flex items-center gap-1.5 text-xs">
            <span>Share</span>
            <input
              type="number"
              min={1}
              max={100}
              value={config.percent}
              onChange={(e) => setStudyConfig({ percent: Number(e.target.value) })}
              className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
              aria-label="Percentage of cells to hide"
            />
            <span>%</span>
            <button type="button" className={btn} onClick={reshuffleStudy} title="Pick different cells (clears your answers)">
              New random mask
            </button>
          </label>
        )}
        <label className="flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={config.outputOnly} onChange={(e) => setStudyConfig({ outputOnly: e.target.checked })} />
          Only hide the Output column
        </label>
        <label className="flex items-center gap-1.5 text-xs" title="Right answer with a classic slip: 3 for 3.0, true for True, a list written as a tuple…">
          <input
            type="checkbox"
            checked={config.closeCredit === 0.5}
            onChange={(e) => setStudyConfig({ closeCredit: e.target.checked ? 0.5 : 0 })}
          />
          “Almost” earns half marks
        </label>
      </div>

      {config.maskMode === 'columns' && !config.outputOnly && (
        <fieldset className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <legend className="sr-only">Columns to hide</legend>
          {askable.map((c) => (
            <label key={c.id} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={config.columns.includes(c.id)}
                onChange={(e) =>
                  setStudyConfig({ columns: e.target.checked ? [...config.columns, c.id] : config.columns.filter((x) => x !== c.id) })
                }
              />
              <span className="font-mono">{columnLabel(c)}</span>
            </label>
          ))}
        </fieldset>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          id="study-check"
          type="button"
          onClick={checkAnswers}
          disabled={model.masked.length === 0}
          className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50"
        >
          Check answers
        </button>
        <button type="button" className={btn} onClick={resetAnswers}>
          Reset answers
        </button>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          <kbd>Enter</kbd> / <kbd>↓</kbd> next · <kbd>Shift+Enter</kbd> / <kbd>↑</kbd> previous · <kbd>Tab</kbd> across · <kbd>Alt+H</kbd> hint ·{' '}
          <kbd>Alt+R</kbd> reveal · <kbd>Alt+W</kbd> why (wrong answers) · output lines: write <code>\n</code> between them
        </p>
      </div>

      {score && <ScoreBar score={score} />}
    </section>
  )
}
