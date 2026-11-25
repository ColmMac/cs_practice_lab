import { useLayoutEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { findGuide } from '../../app/guides'
import { PageMeta } from '../../app/PageMeta'
import { ToolGuide } from '../../app/ToolGuide'
import { toolDescription } from '../../app/tools'
import { numberUrlParams, parseNumberUrl, toBinary, type Mode, type Topic, type Width } from '../../core/numbers'
import { newSeed } from '../../core/study/rng'
import { AdSlot } from '../ui/AdSlot'
import { useAdsAllowed } from '../ui/useAdsAllowed'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { ToolHeader } from '../ui/ToolHeader'
import { ToolWorkspace } from '../ui/ToolWorkspace'
import { AdditionView } from './AdditionView'
import { BitRegister } from './BitRegister'
import { PracticeView } from './PracticeView'
import { FIELDS, SHIFTS, sumLine, useBitSandbox, type Note, type ShiftKind } from './useBitSandbox'

function Explain({ note }: { note: Note }) {
  if (!note) return null
  if (note.kind === 'shift') {
    return (
      <>
        <p>
          {SHIFTS[note.shift].label} shift by 1. Bit shifted out:{' '}
          <strong data-testid="bit-out">{note.out ?? 'none'}</strong>.
        </p>
        {note.overflow !== undefined && (
          <Badge tone={note.overflow ? 'warn' : 'ok'}>
            {note.overflow
              ? 'Overflow: the signed value is no longer doubled.'
              : 'No overflow: the signed value doubled.'}
          </Badge>
        )}
      </>
    )
  }
  if (note.kind === 'invert') return <p>Every bit flipped (one’s complement).</p>
  return (
    <p className="font-mono">
      Two’s complement: invert {toBinary(note.before)} → {toBinary(note.inverted)}, then add 1.
    </p>
  )
}

export function NumberSystemsPage() {
  const [params, setParams] = useSearchParams()
  // Read the link once; after that the page owns the state and writes it back to the URL.
  const [start] = useState(() => parseNumberUrl(params))
  const s = useBitSandbox({ width: start.width, bits: start.bits })
  const [mode, setMode] = useState<Mode>(start.mode)
  const [seed, setSeed] = useState(() => start.seed ?? newSeed())
  const [topic, setTopic] = useState<Topic | null>(start.topic)

  const ads = useAdsAllowed(mode === 'practice')
  // no worked answers under practice questions
  const guide = mode === 'practice' ? null : findGuide('/number-systems')!

  // A LAYOUT effect: a passive one can still be pending when the next nav link is clicked, and then overwrites it.
  useLayoutEffect(() => {
    setParams(numberUrlParams({ mode, width: s.width, bits: s.bits, topic, seed }), { replace: true })
  }, [mode, s.width, s.bits, topic, seed, setParams])
  return (
    <>
      <PageMeta title="Number systems" description={toolDescription('/number-systems')} faq={guide?.faq} />
      <ToolWorkspace>
        <ToolHeader title="Number systems">
          <SegmentedToggle
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'sandbox', label: 'Bit sandbox' },
              { value: 'add', label: 'Addition' },
              { value: 'practice', label: 'Practice' },
            ]}
          />
          {mode !== 'practice' && (
            <SegmentedToggle
              label="Width"
              value={String(s.width) as '8' | '16'}
              onChange={(v) => s.setWidth(Number(v) as Width)}
              options={[
                { value: '8', label: '8-bit' },
                { value: '16', label: '16-bit' },
              ]}
            />
          )}
          {mode === 'sandbox' && (
            <SegmentedToggle
              label="Weights"
              value={s.view}
              onChange={s.setView}
              options={[
                { value: 'unsigned', label: 'Unsigned', hint: 'Top bit is positive' },
                { value: 'signed', label: 'Signed', hint: 'Top bit is negative (two’s complement)' },
              ]}
            />
          )}
        </ToolHeader>
        {mode === 'practice' ? (
          <PracticeView seed={seed} topic={topic} onTopic={setTopic} onSeed={setSeed} />
        ) : mode === 'add' ? (
          <AdditionView width={s.width} initial={{ a: start.a, b: start.b }} footer={<AdSlot ads={ads} />} />
        ) : (
          <main className="grid flex-1 content-start gap-4 p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex min-w-0 flex-col gap-3">
              <Panel title="Register">
                <div className="flex flex-col gap-3 p-3">
                  <BitRegister bits={s.bits} view={s.view} onToggle={s.toggle} />
                  <p data-testid="sum-line" className="font-mono text-sm" aria-live="polite">
                    {sumLine(s.bits, s.view)}
                  </p>
                </div>
              </Panel>
              <Panel title="Operations">
                <div className="flex flex-col gap-3 p-3">
                  <div role="group" aria-label="Shift" className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-600 dark:text-slate-400">Shift by 1</span>
                    {(Object.keys(SHIFTS) as ShiftKind[]).map((k) => (
                      <Button key={k} onClick={() => s.shift(k)}>
                        {SHIFTS[k].label}
                      </Button>
                    ))}
                  </div>
                  <div role="group" aria-label="Register actions" className="flex flex-wrap gap-2">
                    <Button onClick={s.clear}>Clear</Button>
                    <Button onClick={s.invert}>Invert</Button>
                    <Button onClick={s.negate} title="Two’s complement: invert, then add 1">
                      Negate
                    </Button>
                  </div>
                  <div aria-live="polite" className="flex min-h-5 flex-col gap-1 text-sm">
                    <Explain note={s.note} />
                  </div>
                </div>
              </Panel>
            </div>
            <div className="flex min-w-0 flex-col gap-3 self-start">
              <Panel title="Values">
                <div className="flex flex-col gap-3 p-3">
                  {FIELDS.map((f) => {
                    const err = s.errors[f.base]
                    return (
                      <div key={f.base} className="flex flex-col gap-1">
                        <label htmlFor={`num-${f.base}`} className="text-sm font-semibold">
                          {f.label}{' '}
                          <span className="text-xs font-normal text-slate-600 dark:text-slate-400">{f.hint}</span>
                        </label>
                        <input
                          id={`num-${f.base}`}
                          value={s.values[f.base]}
                          onChange={(e) => s.edit(f.base, e.target.value)}
                          onBlur={s.endEdit}
                          spellCheck={false}
                          autoComplete="off"
                          aria-invalid={err ? true : undefined}
                          aria-describedby={`num-${f.base}-err`}
                          className={`w-full rounded border bg-white px-2 py-1 font-mono text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100 ${
                            err ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                          }`}
                        />
                        <p
                          id={`num-${f.base}-err`}
                          aria-live="polite"
                          className="min-h-4 text-xs text-red-700 dark:text-red-300"
                        >
                          {err}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </Panel>
              <AdSlot ads={ads} />
            </div>
          </main>
        )}
      </ToolWorkspace>
      {guide && <ToolGuide guide={guide} />}
    </>
  )
}
