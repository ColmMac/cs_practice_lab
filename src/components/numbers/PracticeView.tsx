import { explain, TOPICS, type Topic } from '../../core/numbers'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { AnswerCell } from '../study/AnswerCell'
import { ScoreBar } from '../study/ScoreBar'
import { CHECK_ID } from '../study/useAnswerGrid'
import { usePractice } from './usePractice'

/** Practice mode: eight seeded questions, graded with the shared answer grid; the working appears after checking. */
export function PracticeView({
  seed,
  topic,
  onTopic,
  onSeed,
}: {
  seed: number
  topic: Topic | null
  onTopic: (topic: Topic | null) => void
  onSeed: (seed: number) => void
}) {
  const p = usePractice(seed, topic, onSeed)
  const { grid } = p
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <Panel title="Practice">
        <div className="flex flex-col gap-3 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button id={CHECK_ID} variant="primary" onClick={grid.check}>
              Check answers
            </Button>
            <Button onClick={grid.reset}>Reset answers</Button>
            <Button onClick={p.next}>New questions</Button>
            <label className="flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
              Topic
              <select
                value={topic ?? ''}
                onChange={(e) => {
                  onTopic((e.target.value || null) as Topic | null)
                  grid.reset()
                }}
                className="rounded border border-slate-300 bg-white px-1 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All topics</option>
                {(Object.keys(TOPICS) as Topic[]).map((t) => (
                  <option key={t} value={t}>
                    {TOPICS[t].label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-[11px] text-slate-600 dark:text-slate-400">
              <kbd>Enter</kbd> / <kbd>↓</kbd> next · <kbd>Shift+Enter</kbd> / <kbd>↑</kbd> previous · <kbd>Alt+H</kbd> hint · <kbd>Alt+R</kbd> reveal ·
              formatting such as 0b, 0x and spaces is fine.
            </p>
          </div>
          <ol className="flex flex-col gap-4" onKeyDown={grid.onKeyDown}>
            {p.questions.map((q, i) => (
              <li key={q.id} data-testid="question" data-kind={q.kind} className="flex flex-col gap-1">
                <p className="text-sm">
                  <span className="font-semibold">Q{i + 1}.</span>{' '}
                  <span className="text-xs text-slate-600 dark:text-slate-400">({p.label(q)})</span>
                </p>
                <p className="font-mono text-sm" data-testid="prompt">
                  {q.prompt}
                </p>
                <div className="max-w-md">
                  <AnswerCell
                    cellKey={q.id}
                    colId={q.kind}
                    label={`Answer to question ${i + 1}`}
                    answer={grid.answers[q.id] ?? ''}
                    grade={grid.graded?.[q.id]}
                    revealed={!!grid.revealed[q.id]}
                    truthText={q.truth}
                    hint={p.hint(q)}
                    onAnswer={(t) => grid.setAnswer(q.id, t)}
                    onReveal={() => grid.reveal(q.id)}
                    onHint={() => grid.toggleHint(q.id)}
                  />
                </div>
                {p.showWorking(q) && (
                  <details open className="text-sm">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">Working</summary>
                    <pre data-testid="working" className="mt-1 overflow-x-auto rounded bg-slate-100 p-2 font-mono text-xs dark:bg-slate-900">
                      {explain(q).join('\n')}
                    </pre>
                  </details>
                )}
              </li>
            ))}
          </ol>
          {p.score && <ScoreBar score={p.score} />}
        </div>
      </Panel>
    </main>
  )
}
