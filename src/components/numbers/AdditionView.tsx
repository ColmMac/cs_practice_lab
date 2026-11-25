import type { ReactNode } from 'react'
import type { Bits, Width } from '../../core/numbers'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Panel'
import { BitRegister } from './BitRegister'
import { describeColumn, useAddition, type Operand } from './useAddition'

const cell = 'px-1.5 py-1 text-center font-mono text-base tabular-nums'
const rowHead = 'pr-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400'
const colHead = 'px-1.5 text-center text-xs font-normal tabular-nums text-slate-600 dark:text-slate-400'

function OperandField({
  which,
  name,
  s,
}: {
  which: Operand
  name: string
  s: ReturnType<typeof useAddition>
}) {
  const err = s.errors[which]
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={`add-${which}`} className="text-sm font-semibold">
        {name} <span className="text-xs font-normal text-slate-600 dark:text-slate-400">binary</span>
      </label>
      <input
        id={`add-${which}`}
        value={s.text(which)}
        onChange={(e) => s.edit(which, e.target.value)}
        onBlur={s.endEdit}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={err ? true : undefined}
        aria-describedby={`add-${which}-err`}
        className={`w-full rounded border bg-white px-2 py-1 font-mono text-sm text-slate-900 dark:bg-slate-900 dark:text-slate-100 ${
          err ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
        }`}
      />
      <p
        id={`add-${which}-err`}
        aria-live="polite"
        className="min-h-4 text-xs text-red-700 dark:text-red-300"
      >
        {err}
      </p>
    </div>
  )
}

function Reading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-1 text-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

export function AdditionView({ width, initial }: { width: Width; initial?: { a: Bits | null; b: Bits | null } }) {
  const s = useAddition(width, initial)
  const { a, b, result } = s
  const n = width
  const lo = n - s.revealed // index of the leftmost column worked so far
  const cur = s.last && !s.done ? s.last.index : -1

  return (
    <main className="grid min-h-0 flex-1 content-start gap-4 overflow-auto p-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex min-w-0 flex-col gap-3">
        <Panel title="Operands">
          <div className="flex flex-col gap-3 p-3">
            <BitRegister name="Operand A" bits={a} view="unsigned" onToggle={(i) => s.toggle('a', i)} />
            <BitRegister name="Operand B" bits={b} view="unsigned" onToggle={(i) => s.toggle('b', i)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <OperandField which="a" name="Operand A" s={s} />
              <OperandField which="b" name="Operand B" s={s} />
            </div>
            <div role="group" aria-label="Examples" className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-600 dark:text-slate-400">Examples</span>
              <Button onClick={() => s.load(2 ** (n - 1) - 1, 1)}>Signed overflow</Button>
              <Button onClick={() => s.load(2 ** n - 1, 1)}>Carry out</Button>
              <Button onClick={() => s.load(37, 18)}>No problems</Button>
              <Button onClick={s.clear}>Clear</Button>
            </div>
          </div>
        </Panel>
        <Panel title="Working">
          <div className="flex flex-col gap-3 p-3">
            <div className="overflow-x-auto pb-1">
              <table data-testid="addition-table" className="border-collapse">
                <caption className="sr-only">Binary addition, column by column</caption>
                <thead>
                  <tr>
                    <td />
                    <th scope="col" className={colHead}>
                      out
                    </th>
                    {a.map((_, i) => (
                      <th key={i} scope="col" className={colHead}>
                        {n - 1 - i}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr data-testid="carry-row">
                    <th scope="row" className={rowHead}>
                      Carry
                    </th>
                    <td
                      data-testid="carry-out"
                      className={`${cell} ${result.carryOut === 1 ? 'bg-amber-100 font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200' : ''}`}
                    >
                      {s.done ? result.carryOut : ''}
                    </td>
                    {result.carries.map((c, i) => (
                      <td
                        key={i}
                        data-testid="carry"
                        className={`${cell} ${c === 1 ? 'bg-amber-100 font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-200' : 'text-slate-600 dark:text-slate-400'}`}
                      >
                        {i >= lo - 1 ? c : ''}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <th scope="row" className={rowHead}>
                      A
                    </th>
                    <td />
                    {a.map((x, i) => (
                      <td key={i} className={cell}>
                        {x}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b-2 border-slate-900 dark:border-slate-100">
                    <th scope="row" className={rowHead}>
                      + B
                    </th>
                    <td />
                    {b.map((x, i) => (
                      <td key={i} className={cell}>
                        {x}
                      </td>
                    ))}
                  </tr>
                  <tr data-testid="result-row">
                    <th scope="row" className={rowHead}>
                      Result
                    </th>
                    <td className={`${cell} text-slate-600 dark:text-slate-400`}>
                      {s.done && result.carryOut === 1 ? '(1)' : ''}
                    </td>
                    {result.bits.map((x, i) => (
                      <td
                        key={i}
                        data-testid="result-bit"
                        aria-current={cur === i ? 'step' : undefined}
                        className={`${cell} font-bold ${cur === i ? 'bg-emerald-100 outline outline-2 -outline-offset-2 outline-accent dark:bg-emerald-950' : ''}`}
                      >
                        {i >= lo ? x : ''}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div role="group" aria-label="Step through" className="flex flex-wrap gap-2">
              <Button onClick={s.restart}>Step through</Button>
              <Button onClick={s.prev} disabled={s.revealed === 0}>
                Previous column
              </Button>
              <Button onClick={s.next} disabled={s.done}>
                Next column
              </Button>
              <Button onClick={s.showAll} disabled={s.done}>
                Show all
              </Button>
            </div>
            <p data-testid="step-text" aria-live="polite" className="min-h-5 text-sm">
              {s.last && !s.done
                ? describeColumn(s.last)
                : s.done
                  ? 'All columns added.'
                  : 'Press “Next column” to add one column at a time, starting from the right.'}
            </p>
          </div>
        </Panel>
      </div>
      <Panel title="Verdict" className="min-w-0 self-start">
        <div className="flex flex-col gap-4 p-3" data-testid="verdict">
          {!s.done ? (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Finish the last column to see the verdict.
            </p>
          ) : (
            <>
              <Reading title="Unsigned reading">
                <p className="font-mono">
                  {s.unsigned.a} + {s.unsigned.b} = {s.unsigned.sum}
                </p>
                {result.carryOut ? (
                  <Badge tone="warn">
                    Carry out of the top column: the answer needs {n + 1} bits, so {n} bits gives{' '}
                    {s.unsigned.shown}, not {s.unsigned.sum}.
                  </Badge>
                ) : (
                  <Badge tone="ok">No carry out: the result fits in {n} bits.</Badge>
                )}
              </Reading>
              <Reading title="Signed reading (two’s complement)">
                <p className="font-mono">
                  {s.signed.a} + {s.signed.b} = {s.signed.sum}
                </p>
                {result.overflow ? (
                  <Badge tone="warn">
                    Overflow: {result.overflowReason}. The register shows {s.signed.shown}, not {s.signed.sum}
                    .
                  </Badge>
                ) : (
                  <Badge tone="ok">No overflow: the signed result {s.signed.shown} is correct.</Badge>
                )}
              </Reading>
            </>
          )}
        </div>
      </Panel>
    </main>
  )
}
