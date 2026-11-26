import { formatPoints, type Score } from '../../core/study/score'
import { Eye } from 'lucide-react'
import { ICON_BEFORE } from '../ui/icons'
import { useAnnounce } from '../ui/announce'

/** The result of Check answers (tool-agnostic): points, counts, anything edited since, and a per-column breakdown. */
/** `id` makes it a focus target (not a Tab stop). */
export function ScoreBar({ score, id }: { score: Score; id?: string }) {
  const line = `Score: ${formatPoints(score.points, score.total)} · ${score.percent}%`
  // it appears because of Check answers, so it is read as it appears; edited answers wait for the next check
  useAnnounce(score.pending === 0 ? line : '', { initial: true })
  return (
    <section
      id={id}
      tabIndex={id ? -1 : undefined}
      aria-label="Score"
      className="mt-3 rounded border border-border bg-surface p-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-accent"
    >
      <p className="text-base font-semibold">{line}</p>
      <p className="mt-1 text-slate-700 dark:text-slate-300">
        <span className="text-emerald-800 dark:text-emerald-300">✓ {score.correct} correct</span> ·{' '}
        <span className="text-amber-800 dark:text-amber-300">≈ {score.close} almost</span> ·{' '}
        <span className="text-red-800 dark:text-red-300">✗ {score.incorrect} wrong</span>
        {score.revealed > 0 && (
          <>
            {' '}
            · <Eye aria-hidden="true" className={ICON_BEFORE} />
            {score.revealed} revealed (not scored)
          </>
        )}
      </p>
      {score.pending > 0 && (
        <p className="mt-1 text-amber-800 dark:text-amber-300">
          {score.pending} answer{score.pending === 1 ? ' was' : 's were'} changed since you last checked. Press Check answers again to
          update your score.
        </p>
      )}
      {score.byColumn.length > 1 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-slate-700 dark:text-slate-300">By column</summary>
          <table className="mt-1 text-xs">
            <caption className="sr-only">Score by column</caption>
            <thead>
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th scope="col" className="pr-4 font-medium">Column</th>
                <th scope="col" className="pr-3 font-medium">Correct</th>
                <th scope="col" className="pr-3 font-medium">Almost</th>
                <th scope="col" className="font-medium">Wrong</th>
              </tr>
            </thead>
            <tbody>
              {score.byColumn.map((c) => (
                <tr key={c.colId}>
                  <th scope="row" className="pr-4 text-left font-mono font-normal">{c.header}</th>
                  <td className="pr-3">
                    {c.correct} / {c.total}
                  </td>
                  <td className="pr-3">{c.close}</td>
                  <td>{c.incorrect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  )
}
