import { useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { findGuide } from '../../app/guides'
import { PageMeta } from '../../app/PageMeta'
import { ToolGuide } from '../../app/ToolGuide'
import { toolDescription } from '../../app/tools'
import {
  ALGORITHM_INFO,
  LIST_PRESETS,
  MAX_CARDS,
  MAX_VALUE,
  MIN_ITEMS,
  MIN_VALUE,
  parseSortingUrl,
  sortingUrlParams,
  type AlgorithmId,
} from '../../core/algorithms'
import { AdSlot } from '../ui/AdSlot'
import { useAdsAllowed } from '../ui/useAdsAllowed'
import { Button } from '../ui/Button'
import { ExportUnavailable } from '../ui/ExportPanel'
import { HistoryExport } from './HistoryExport'
import { HistoryTable } from './HistoryTable'
import { Panel } from '../ui/Panel'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { ToolHeader } from '../ui/ToolHeader'
import { ToolWorkspace } from '../ui/ToolWorkspace'
import { ArrayStage } from './ArrayStage'
import { QuizPanel } from './QuizPanel'
import { useSorting, type Speed } from './useSorting'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { ICON_AFTER, ICON_BEFORE } from '../ui/icons'

const fieldClass =
  'rounded border bg-white px-2 py-1 text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100'
const okBorder = 'border-slate-300 dark:border-slate-700'

export function SortingPage() {
  const [params, setParams] = useSearchParams()
  // Read the link once; after that the page owns the state and writes it back to the URL.
  const [start] = useState(() => parseSortingUrl(params))
  const s = useSorting(start)
  const ads = useAdsAllowed(s.quizOn)
  // no worked passes under the quiz
  const guide = s.quizOn ? null : findGuide('/sorting-visualizer')!
  // A LAYOUT effect: a passive one can still be pending when the next nav link is clicked, and then overwrites it.
  useLayoutEffect(() => {
    setParams(
      sortingUrlParams({ algo: s.algo, data: s.data, target: s.target, search: s.search, quiz: s.quizOn }),
      { replace: true },
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps -- s.data/s.target are fresh arrays/values per parse; key on their text
  }, [s.algo, s.data?.join(','), s.target, s.search, s.quizOn, setParams])
  const count = s.frame.cards.length
  const unsorted = s.algo === 'binary' && s.listError?.startsWith('Binary search needs')

  return (
    <>
      <PageMeta title="Sorting & searching" description={toolDescription('/sorting-visualizer')} faq={guide?.faq} />
      <ToolWorkspace>
        <ToolHeader title="Sorting & searching">
          <label className="flex max-w-full items-center gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-400">Algorithm</span>
            <select
              value={s.algo}
              onChange={(e) => s.setAlgo(e.target.value as AlgorithmId)}
              className={`${fieldClass} ${okBorder} min-w-0`}
            >
              <optgroup label="Sorting">
                {ALGORITHM_INFO.filter((a) => a.kind === 'sort').map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Searching">
                {ALGORITHM_INFO.filter((a) => a.kind === 'search').map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex max-w-full items-center gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-400">Example</span>
            <select
              value={s.presetId}
              onChange={(e) => e.target.value !== 'custom' && s.choosePreset(e.target.value)}
              className={`${fieldClass} ${okBorder} min-w-0`}
            >
              <option value="custom">Custom list</option>
              {LIST_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <SegmentedToggle
            label="Mode"
            value={s.quizOn ? 'quiz' : 'watch'}
            onChange={(v) => s.setQuizOn(v === 'quiz')}
            options={[
              { value: 'watch', label: 'Watch' },
              { value: 'quiz', label: 'Quiz', hint: 'Predict each pass or probe before it is shown' },
            ]}
          />
          <SegmentedToggle
            label="Speed"
            value={s.speed}
            onChange={(v: Speed) => s.setSpeed(v)}
            options={[
              { value: 'slow', label: 'Slow' },
              { value: 'normal', label: 'Normal' },
              { value: 'fast', label: 'Fast' },
            ]}
          />
          {s.history ? (
            <HistoryExport table={s.history} />
          ) : (
            <ExportUnavailable reason="Enter a valid list first" />
          )}
        </ToolHeader>
        <main className="grid flex-1 content-start gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <Panel title="Visualiser">
              <div className="flex flex-col gap-3 p-3">
                <ArrayStage frame={s.frame} count={count} />
                {!s.quizOn && (
                  <div role="group" aria-label="Playback" className="flex flex-wrap items-center gap-2">
                    <Button onClick={s.back} disabled={s.atStart || !s.run}>
                      <ChevronLeft aria-hidden="true" className={ICON_BEFORE} />
                      Step back
                    </Button>
                    <Button onClick={s.step} disabled={s.atEnd || !s.run}>
                      Step
                      <ChevronRight aria-hidden="true" className={ICON_AFTER} />
                    </Button>
                    <Button variant="primary" onClick={s.togglePlay} disabled={!s.run}>
                      {s.playing ? 'Pause' : s.atEnd && s.run ? 'Replay' : 'Play'}
                    </Button>
                    <Button onClick={s.reset} disabled={s.atStart}>
                      Reset
                    </Button>
                    {s.run && (
                      <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">
                        Step {s.index} of {s.frames.length - 1}
                      </span>
                    )}
                  </div>
                )}
                <p
                  data-testid="caption"
                  aria-live="polite"
                  aria-atomic="true"
                  className="min-h-10 rounded bg-slate-50 px-3 py-2 text-sm dark:bg-slate-900"
                >
                  {s.frame.caption}
                </p>
                {s.run && !s.quizActive && (
                  <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    <div className="flex gap-1">
                      <dt className="text-slate-600 dark:text-slate-400">Comparisons</dt>
                      <dd data-testid="comparisons" className="font-mono font-semibold">
                        {s.frame.comparisons}
                      </dd>
                    </div>
                    {s.algo === 'insertion' ? (
                      <div className="flex gap-1">
                        <dt className="text-slate-600 dark:text-slate-400">Shifts</dt>
                        <dd data-testid="moves" className="font-mono font-semibold">
                          {s.frame.shifts}
                        </dd>
                      </div>
                    ) : (
                      !s.search &&
                      s.algo !== 'merge' && (
                        <div className="flex gap-1">
                          <dt className="text-slate-600 dark:text-slate-400">Swaps</dt>
                          <dd data-testid="moves" className="font-mono font-semibold">
                            {s.frame.swaps}
                          </dd>
                        </div>
                      )
                    )}
                    {!s.search && (
                      <div className="flex gap-1">
                        <dt className="text-slate-600 dark:text-slate-400">
                          {s.algo === 'merge' ? 'Levels done' : 'Passes done'}
                        </dt>
                        <dd className="font-mono font-semibold">{s.frame.pass}</dd>
                      </div>
                    )}
                  </dl>
                )}
              </div>
            </Panel>
            {s.quizOn && (
              <Panel title="Quiz: predict the next step">
                <div className="p-3">
                  <QuizPanel quiz={s.quiz} />
                </div>
              </Panel>
            )}
            {s.history && !s.quizActive && (
              <Panel title={s.search ? 'Probe history' : 'Pass history'}>
                <div className="p-3">
                  <HistoryTable table={s.history} frame={s.index} />
                </div>
              </Panel>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-3 self-start">
            <Panel title="Input">
              <div className="flex flex-col gap-3 p-3">
                <div className="flex flex-col gap-1">
                  <label htmlFor="sort-list" className="text-sm font-semibold">
                    List{' '}
                    <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
                      {MIN_ITEMS} to {MAX_CARDS} whole numbers, {MIN_VALUE} to {MAX_VALUE}
                    </span>
                  </label>
                  <input
                    id="sort-list"
                    value={s.text}
                    onChange={(e) => s.setText(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    aria-invalid={s.listError ? true : undefined}
                    aria-describedby="sort-list-err"
                    className={`${fieldClass} font-mono ${s.listError ? 'border-red-500' : okBorder}`}
                  />
                  <p
                    id="sort-list-err"
                    aria-live="polite"
                    className="min-h-4 text-xs text-red-700 dark:text-red-300"
                  >
                    {s.listError}
                  </p>
                  {unsorted && (
                    <div>
                      <Button onClick={s.sortTheList}>Sort the list</Button>
                    </div>
                  )}
                </div>
                {s.search && (
                  <div className="flex flex-col gap-1">
                    <label htmlFor="sort-target" className="text-sm font-semibold">
                      Target{' '}
                      <span className="text-xs font-normal text-slate-600 dark:text-slate-400">
                        the number to find
                      </span>
                    </label>
                    <input
                      id="sort-target"
                      value={s.targetText}
                      onChange={(e) => s.setTargetText(e.target.value)}
                      spellCheck={false}
                      autoComplete="off"
                      inputMode="numeric"
                      aria-invalid={s.targetError ? true : undefined}
                      aria-describedby="sort-target-err"
                      className={`${fieldClass} w-28 font-mono ${s.targetError ? 'border-red-500' : okBorder}`}
                    />
                    <p
                      id="sort-target-err"
                      aria-live="polite"
                      className="min-h-4 text-xs text-red-700 dark:text-red-300"
                    >
                      {s.targetError}
                    </p>
                  </div>
                )}
                {s.algo === 'bubble' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={s.earlyExit}
                      onChange={(e) => s.setEarlyExit(e.target.checked)}
                    />
                    Stop early when a pass makes no swaps
                  </label>
                )}
                {s.run && !s.quizActive && (
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {s.search
                      ? s.run.foundAt === null || s.run.foundAt === undefined
                        ? `Result: ${s.run.target} is not in the list (${s.run.comparisons} comparisons).`
                        : `Result: found ${s.run.target} at index ${s.run.foundAt} (${s.run.comparisons} comparisons).`
                      : `Whole run: ${s.run.comparisons} comparisons, ${
                          s.algo === 'insertion'
                            ? `${s.run.shifts} shifts`
                            : s.algo === 'merge'
                              ? 'no swaps (merging copies values)'
                              : `${s.run.swaps} swaps`
                        }.`}
                  </p>
                )}
              </div>
            </Panel>
            <AdSlot ads={ads} />
          </div>
        </main>
      </ToolWorkspace>
      {guide && <ToolGuide guide={guide} />}
    </>
  )
}
