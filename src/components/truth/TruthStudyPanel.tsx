import type { TruthMask } from '../../core/logic'
import { Button } from '../ui/Button'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { ScoreBar } from '../study/ScoreBar'
import { CHECK_ID } from '../study/useAnswerGrid'
import type { TruthStudy } from './useTruthStudy'

/** Controls for a truth-table study session: what to hide, Check answers, Reset, and the score. */
export function TruthStudyPanel({ study }: { study: TruthStudy }) {
  const { config, grid, score } = study
  const revealed = Object.keys(grid.revealed).length

  return (
    <section aria-label="Study mode" className="rounded border border-accent/40 bg-accent-soft/40 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="font-semibold">Study mode</h2>
        <p className="text-xs text-slate-700 dark:text-slate-300" role="status">
          {study.questions === 0
            ? 'Nothing is hidden: choose what to mask.'
            : `${study.questions} of ${study.cellCount} cells to fill in${revealed ? ` (${revealed} revealed)` : ''}`}
        </p>
        <Button variant="small" className="ml-auto" onClick={study.exit}>
          Exit study mode
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <SegmentedToggle<TruthMask>
          label="Hide"
          value={config.mask}
          onChange={(mask) => study.setConfig({ mask })}
          options={[
            { value: 'outputs', label: 'Outputs', hint: 'Only the output columns' },
            {
              value: 'intermediates',
              label: 'Intermediates + outputs',
              hint: study.hasIntermediates ? 'Every column that is worked out' : 'Turn on the intermediate columns first, or this is the same as Outputs',
            },
            { value: 'random', label: 'Random', hint: 'A random share of the worked-out cells' },
          ]}
        />
        {config.mask === 'random' && (
          <label className="flex items-center gap-1.5 text-xs">
            <span>Share</span>
            <input
              type="number"
              min={1}
              max={100}
              value={config.percent}
              onChange={(e) => study.setConfig({ percent: Math.min(100, Math.max(1, Number(e.target.value) || 1)) })}
              className="w-16 rounded border border-slate-300 bg-white px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-900"
              aria-label="Percentage of cells to hide"
            />
            <span>%</span>
            <Button variant="small" onClick={study.reshuffle} title="Pick different cells (clears your answers)">
              New random mask
            </Button>
          </label>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button id={CHECK_ID} variant="primary" onClick={grid.check} disabled={study.questions === 0}>
          Check answers
        </Button>
        <Button variant="small" onClick={grid.reset}>
          Reset answers
        </Button>
        <p className="text-[11px] text-slate-600 dark:text-slate-400">
          <kbd>Enter</kbd> / <kbd>↓</kbd> next · <kbd>Shift+Enter</kbd> / <kbd>↑</kbd> previous · <kbd>Alt+H</kbd> hint · <kbd>Alt+R</kbd> reveal · answer
          with 0, 1, T or F. Changing the expression or options ends study mode.
        </p>
      </div>

      {score && <ScoreBar score={score} />}
    </section>
  )
}
