import { useEffect, useId, useRef, useState } from 'react'
import { EXAM_DIALECTS, type ExamDialect, type PseudoLine, type PseudoResult } from '../../core/pseudocode/types'
import type { TraceRunner } from '../../core/runner'
import { useStore } from '../../store'
import { getRunner } from '../../store/runner'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { SegmentedToggle } from '../ui/SegmentedToggle'

export const DIALECT_KEY = 'tts:pseudo-dialect'
/** Typing must not send a request per key. */
export const CONVERT_DELAY_MS = 400

const LABELS: Record<ExamDialect, string> = { aqa: 'AQA', ocr: 'OCR', sqa: 'SQA' }
const SOURCES: Record<ExamDialect, string> = {
  aqa: 'AQA GCSE pseudo-code (8525).',
  ocr: 'OCR Exam Reference Language (J277).',
  sqa: 'SQA reference language (Higher).',
}
const NO_EQUIVALENT = 'no exam equivalent'

function savedDialect(): ExamDialect {
  try {
    const saved = localStorage.getItem(DIALECT_KEY)
    return EXAM_DIALECTS.find((d) => d === saved) ?? 'aqa'
  } catch {
    return 'aqa' // storage blocked
  }
}

/** "Exam pseudocode": a read-only rewrite of the program, closed by default. */
export function PseudocodePanel() {
  const language = useStore((s) => s.language)
  const runner = getRunner(language)
  const [open, setOpen] = useState(false)
  const [dialect, setDialect] = useState(savedDialect)
  const bodyId = useId()

  if (!runner.toPseudocode) return null

  const choose = (next: ExamDialect) => {
    setDialect(next)
    try {
      localStorage.setItem(DIALECT_KEY, next)
    } catch {
      /* ignore: it just won't be remembered */
    }
  }

  return (
    <Panel className="shrink-0 projector:hidden">
      <h2 className="text-sm font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? bodyId : undefined}
          onClick={() => setOpen(!open)}
          className={`flex w-full items-center gap-2 bg-slate-50 px-3 py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-emerald-700 dark:bg-slate-900 ${
            open ? 'border-b border-slate-300 dark:border-slate-700' : ''
          }`}
        >
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          Exam pseudocode
        </button>
      </h2>
      {open && (
        <div id={bodyId} className="p-3">
          <SegmentedToggle
            label="Exam board"
            value={dialect}
            options={EXAM_DIALECTS.map((d) => ({ value: d, label: LABELS[d], hint: SOURCES[d] }))}
            onChange={choose}
          />
          <Conversion runner={runner} dialect={dialect} />
        </div>
      )}
    </Panel>
  )
}

type Answer = { key: string } & ({ result: PseudoResult } | { failed: true })

/** Mounted only while the panel is open, so a closed panel never asks Python for anything. */
function Conversion({ runner, dialect }: { runner: TraceRunner; dialect: ExamDialect }) {
  // With a table on screen, convert what PRODUCED it so the line highlights stay true.
  const ranCode = useStore((s) => (s.result ? s.ranInput?.code : undefined))
  const editorCode = useStore((s) => s.code)
  const code = ranCode ?? editorCode
  const [attempt, setAttempt] = useState(0)
  const [answer, setAnswer] = useState<Answer | null>(null)
  const key = JSON.stringify([dialect, attempt, code])

  useEffect(() => {
    let current = true // a newer request makes this one's answer irrelevant
    const timer = setTimeout(() => {
      runner.toPseudocode!(code, dialect).then(
        (result) => current && setAnswer({ key, result }),
        () => current && setAnswer({ key, failed: true }),
      )
    }, CONVERT_DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [runner, code, dialect, key])

  const fresh = answer?.key === key
  // the last good answer stays on screen (dimmed) while the next one is on its way
  const shown = answer && 'result' in answer ? answer.result : null

  return (
    <>
      {ranCode !== undefined && ranCode !== editorCode && (
        <p role="status" className="mt-2 text-xs text-amber-800 dark:text-amber-300">
          The code has changed since the last run. This pseudocode matches the table — run again to update it.
        </p>
      )}
      {fresh && 'failed' in answer ? (
        <p role="alert" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-700 dark:text-red-300">
          Python could not convert the program just now.
          <Button variant="small" onClick={() => setAttempt(attempt + 1)}>
            Try again
          </Button>
        </p>
      ) : !shown ? (
        <p role="status" className="mt-2 text-xs text-slate-600 dark:text-slate-400">
          Converting… (this waits for Python to finish loading)
        </p>
      ) : !shown.ok ? (
        <p role="alert" aria-busy={!fresh} className="mt-2 text-xs text-red-700 dark:text-red-300">
          {shown.line ? `Line ${shown.line}: ` : ''}
          {shown.message}
        </p>
      ) : shown.lines.length === 0 ? (
        <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">There is no code to convert yet.</p>
      ) : (
        <Lines lines={shown.lines} busy={!fresh} linked={ranCode !== undefined} />
      )}
      <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
        {SOURCES[dialect]} A reading aid: Python comments and blank lines are left out, and lines marked “{NO_EQUIVALENT}”
        are not valid exam pseudocode.
      </p>
    </>
  )
}

function Lines({ lines, busy, linked }: { lines: PseudoLine[]; busy: boolean; linked: boolean }) {
  const stepLine = (i: number | null) => (s: ReturnType<typeof useStore.getState>) =>
    !linked || i === null ? null : (s.result?.steps[i]?.lineNumber ?? null)
  const selectedStep = useStore((s) => s.selectedStep)
  const hoverStep = useStore((s) => s.hoverStep)
  const selected = useStore(stepLine(selectedStep))
  const hovered = useStore(stepLine(hoverStep))
  const list = useRef<HTMLOListElement>(null)

  // keep the highlighted line in view by scrolling THIS box only, never the page
  const target = hovered ?? selected
  useEffect(() => {
    const box = list.current
    const item = target === null ? null : box?.querySelector<HTMLElement>(`[data-source-line="${target}"]`)
    if (!box || !item) return
    const top = item.offsetTop - box.offsetTop
    if (top < box.scrollTop) box.scrollTop = top
    else if (top + item.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = top + item.offsetHeight - box.clientHeight
  }, [target])

  return (
    <ol
      ref={list}
      aria-label="Exam pseudocode lines"
      aria-busy={busy}
      tabIndex={0}
      className={`mt-2 max-h-64 overflow-auto rounded border border-slate-300 py-1 font-mono text-sm focus-visible:outline-2 focus-visible:outline-emerald-700 dark:border-slate-700 ${
        busy ? 'opacity-60' : ''
      }`}
    >
      {lines.map((line, i) => {
        const isSelected = line.sourceLine !== null && line.sourceLine === selected
        const isHovered = line.sourceLine !== null && line.sourceLine === hovered
        return (
          <li
            key={i}
            data-source-line={line.sourceLine ?? undefined}
            aria-current={isSelected || undefined}
            className={`whitespace-pre-wrap py-px pr-2 ${
              isSelected ? 'bg-yellow-200 dark:bg-yellow-900/50' : isHovered ? 'bg-yellow-100 dark:bg-yellow-900/25' : ''
            }`}
            style={{ paddingLeft: `calc(0.5rem + ${line.indent * 4}ch)` }}
          >
            {line.text}
            {line.unsupported && (
              <span className="ml-2 rounded bg-amber-100 px-1 font-sans text-[10px] font-semibold text-amber-900 dark:bg-amber-900/50 dark:text-amber-200">
                {line.note ?? NO_EQUIVALENT}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
