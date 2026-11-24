import { formatPoints, type Score } from '../../core/study/score'

/** The result of Check answers: points, counts, anything edited since, and a per-column breakdown. */
export function ScoreSummary({ score }: { score: Score }) {
  return (
    <section
      aria-label="Score"
      className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <p role="status" className="text-base font-semibold">
        Score: {formatPoints(score.points, score.total)} · {score.percent}%
      </p>
      <p className="mt-1 text-slate-700 dark:text-slate-300">
        <span className="text-emerald-800 dark:text-emerald-300">✓ {score.correct} correct</span> ·{' '}
        <span className="text-amber-800 dark:text-amber-300">≈ {score.close} almost</span> ·{' '}
        <span className="text-red-800 dark:text-red-300">✗ {score.incorrect} wrong</span>
        {score.revealed > 0 && <> · 👁 {score.revealed} revealed (not scored)</>}
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
            <thead>
              <tr className="text-left text-slate-600 dark:text-slate-400">
                <th className="pr-4 font-medium">Column</th>
                <th className="pr-3 font-medium">Correct</th>
                <th className="pr-3 font-medium">Almost</th>
                <th className="font-medium">Wrong</th>
              </tr>
            </thead>
            <tbody>
              {score.byColumn.map((c) => (
                <tr key={c.colId}>
                  <td className="pr-4 font-mono">{c.header}</td>
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
