import { useState } from 'react'
import { useStore } from '../../store'

/** Shown when the program called input() with nothing left in Program inputs. */
export function InputPrompt({ prompt }: { prompt: string }) {
  const answerInput = useStore((s) => s.answerInput)
  const [text, setText] = useState('')
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const answer = text
        setText('')
        void answerInput(answer)
      }}
      className="mb-3 flex flex-wrap items-end gap-2 rounded border border-sky-300 bg-sky-50 p-3 text-sm dark:border-sky-900 dark:bg-sky-950/50"
    >
      <label className="flex flex-1 flex-col gap-1">
        <span>
          The program asked: <code className="font-mono">{prompt || 'input()'}</code>
        </span>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="Your answer"
          spellCheck={false}
          className="rounded border border-slate-300 bg-white px-2 py-1 font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>
      <button
        type="submit"
        className="rounded bg-sky-700 px-3 py-1.5 font-medium text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        Add answer &amp; run again
      </button>
    </form>
  )
}
