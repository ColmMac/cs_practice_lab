import type { Explanation } from '../../core/explain/stepExplainer'

/** The explanation under an answer. Plain text with nothing focusable, so keyboard order is unchanged. */
export function WhyCallout({ id, explanation }: { id: string; explanation: Explanation }) {
  return (
    <p
      id={id}
      data-testid="why-callout"
      className="w-max max-w-[18rem] rounded border border-slate-300 bg-slate-50 p-2 font-sans text-xs leading-relaxed font-normal whitespace-normal text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {explanation.parts.map((part, i) => {
        if (part.t === 'text') return <span key={i}>{part.s}</span>
        if (part.t === 'result') {
          return (
            <strong key={i} data-part="result" className="font-mono break-words whitespace-pre-wrap">
              {part.s}
            </strong>
          )
        }
        return (
          <code key={i} className="rounded bg-slate-200 px-1 font-mono break-words whitespace-pre-wrap dark:bg-slate-800">
            {part.s}
          </code>
        )
      })}
    </p>
  )
}
