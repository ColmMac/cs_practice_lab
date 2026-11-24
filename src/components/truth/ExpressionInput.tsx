import { useRef } from 'react'
import { Button } from '../ui/Button'
import type { Parsed } from './useTruthPage'

const OPERATORS = ['NOT', 'AND', 'OR', 'XOR', 'NAND', 'NOR', '(', ')', 'A', 'B', 'C', 'D', '0', '1'] as const

/** Source with the error range underlined, so a student can see where the parser gave up. */
function Underlined({ src, at, length }: { src: string; at: number; length: number }) {
  const end = Math.min(src.length, Math.max(at + length, at + 1))
  return (
    <pre
      aria-hidden="true"
      data-testid="error-underline"
      className="overflow-x-auto rounded bg-slate-100 px-2 py-1 font-mono text-sm dark:bg-slate-800"
    >
      {src.slice(0, at)}
      <span className="underline decoration-red-600 decoration-wavy underline-offset-4">{src.slice(at, end) || ' '}</span>
      {src.slice(end)}
    </pre>
  )
}

export function ExpressionInput({
  value,
  onChange,
  parsed,
  parsedSource,
}: {
  value: string
  onChange: (v: string) => void
  parsed: Parsed
  /** The text `parsed` was computed from (the error position indexes into this, not `value`). */
  parsedSource: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const error = parsed.ok ? null : (parsed.error?.message ?? 'That expression could not be read.')

  const insert = (token: string) => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const word = /^[A-Z]{2,}$/.test(token) ? ` ${token} ` : token
    onChange((value.slice(0, start) + word + value.slice(end)).replace(/ {2,}/g, ' '))
    const caret = start + word.length
    requestAnimationFrame(() => {
      el?.focus()
      el?.setSelectionRange(caret, caret)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="truth-expr" className="text-sm font-semibold">
        Boolean expression
      </label>
      <textarea
        id="truth-expr"
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        spellCheck={false}
        aria-invalid={error ? true : undefined}
        aria-describedby="truth-expr-help truth-expr-status"
        placeholder="e.g. S = A XOR B"
        className={`w-full rounded border bg-white px-2 py-1 font-mono text-sm text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 ${
          error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
        }`}
      />
      <div role="group" aria-label="Insert operator" className="flex flex-wrap gap-1">
        {OPERATORS.map((t) => (
          <Button key={t} variant="small" onClick={() => insert(t)} aria-label={`Insert ${t}`}>
            {t}
          </Button>
        ))}
      </div>
      <div id="truth-expr-status" aria-live="polite" className="min-h-5 text-sm">
        {error && (
          <p className="text-red-700 dark:text-red-300">
            <span className="font-semibold">Error:</span> {error}
          </p>
        )}
      </div>
      {!parsed.ok && parsed.error && <Underlined src={parsedSource} at={parsed.error.position} length={parsed.error.length} />}
      <p id="truth-expr-help" className="text-xs text-slate-600 dark:text-slate-400">
        Operators: NOT (! ~ ¬), AND (&amp; &amp;&amp; · ∧), NAND, XOR (^ ⊕), OR (| || + ∨), NOR. Values 0, 1, TRUE, FALSE. Inputs A–D.
        NOT binds tightest, then AND/NAND, XOR, then OR/NOR. Separate several outputs with <code>;</code> or a new line, e.g.{' '}
        <code>S = A XOR B; C = A AND B</code>.
      </p>
    </div>
  )
}
