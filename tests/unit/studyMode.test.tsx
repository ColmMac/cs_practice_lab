import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { encodeShare, decodeShare } from '../../src/core/share/urlState'
import type { TraceOptions, TraceResult } from '../../src/core/types'
import { defaultWorkspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { STORAGE_KEY } from '../../src/store/persistence'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

// CodeMirror needs real layout APIs jsdom doesn't have; the editor is covered in the browser.
vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => {
    const { code, setCode } = useStore()
    return <textarea aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
  },
}))

type Result = TraceResult | ((code: string, o: TraceOptions) => TraceResult)

const CLEAN = {
  result: null,
  ranSig: null,
  running: false,
  hoverStep: null,
  selectedStep: null,
  watchErrors: {},
  shared: null,
  sharedLinkInvalid: false,
  study: null,
  studySessions: {},
  studyOrder: [],
}

// The compact exam table for digit-sum has exactly these 15 answers, in this order down each column:
//   n:      1234, 123, 12, 1, 0      total: 0, 4, 7, 9, 10      digit: 4, 3, 2, 1      output: 10
const N = ['1234', '123', '12', '1', '0']
const TOTAL = ['0', '4', '7', '9', '10']
const DIGIT = ['4', '3', '2', '1']
const OUTPUT = ['10']
const EVERYTHING = [...N, ...TOTAL, ...DIGIT, ...OUTPUT]

function mount(result: Result = traces.digitSum, workspace: Partial<ReturnType<typeof defaultWorkspace>> = {}) {
  const runner = new FakeTraceRunner(result)
  const runSpy = vi.spyOn(runner, 'runTrace')
  setRunnerOverride(runner)
  useStore.setState({ ...defaultWorkspace('x = 1\n'), ...workspace, ...CLEAN })
  render(<App />)
  return { runner, runSpy }
}

const toggle = () => screen.getByRole('button', { name: /📝 study mode/i })
const answerBoxes = () => screen.queryAllByRole('textbox', { name: /^Row \d+ \(line/ }) as HTMLInputElement[]
/** The feedback text under each answer box ("Correct", "Almost — …", "Not correct"), '' when ungraded. */
const verdicts = () =>
  answerBoxes().map((b) => {
    const id = b.getAttribute('aria-describedby')
    return id ? (document.getElementById(id)?.textContent ?? '') : ''
  })
const study = () => useStore.getState().study!
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { state: Record<string, unknown> } | null

async function startStudy(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('table')
  await user.click(toggle())
  await screen.findByRole('region', { name: 'Study mode' })
}

/** Types every answer by clicking each box (the fast path for tests that aren't about the keyboard). */
async function fillAll(user: ReturnType<typeof userEvent.setup>, answers: string[]) {
  const boxes = answerBoxes()
  // boxes are in row-major DOM order; answers are given column by column, so look each up by label
  const byColumn = new Map<string, HTMLInputElement[]>()
  for (const b of boxes) {
    const col = b.dataset.studyCol!
    byColumn.set(col, [...(byColumn.get(col) ?? []), b])
  }
  const order = ['<module>:n', '<module>:total', '<module>:digit', 'output']
  const flat = order.flatMap((c) => byColumn.get(c) ?? [])
  expect(flat).toHaveLength(answers.length)
  for (const [i, b] of flat.entries()) {
    await user.click(b)
    await user.paste(answers[i]!)
  }
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun()
  setRunnerOverride(null)
  vi.restoreAllMocks()
})

describe('Study Mode: turning it on', () => {
  it('is available once there is a table, and starts the session with every written cell hidden', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    expect(toggle()).toHaveAttribute('aria-pressed', 'true')
    expect(answerBoxes()).toHaveLength(15)
    expect(screen.getByText('15 of 15 cells to fill in')).toBeInTheDocument()
    // Line numbers and everything the program did NOT write stay visible
    const table = screen.getByRole('table', { name: 'Trace table' })
    expect(within(table).queryByText('1234')).not.toBeInTheDocument()
    expect(within(table).getAllByRole('row').length).toBe(16)
  })

  it('is disabled before there is anything to study, and explains why', async () => {
    const runner = new FakeTraceRunner(traces.digitSum)
    runner.runTrace = () => new Promise(() => {}) // never finishes: no result yet
    setRunnerOverride(runner)
    useStore.setState({ ...defaultWorkspace('x = 1\n'), ...CLEAN })
    render(<App />)
    expect(toggle()).toBeDisabled()
    expect(toggle()).toHaveAttribute('title', expect.stringMatching(/run/i))
  })

  it('is disabled when the table is out of date', async () => {
    mount()
    await screen.findByRole('table')
    expect(toggle()).toBeEnabled()
    await userEvent.setup().type(screen.getByLabelText('Code editor'), '#')
    expect(toggle()).toBeDisabled()
    expect(toggle()).toHaveAttribute('title', expect.stringMatching(/run the current program/i))
  })

  it('works on a trace that stopped early (partial tables are still studyable)', async () => {
    mount(traces.zeroDivision)
    const user = userEvent.setup()
    await startStudy(user)
    expect(answerBoxes().length).toBeGreaterThan(0)
  })

  it('turns off again, restoring the normal controls', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByRole('button', { name: /exit study mode/i }))
    expect(screen.queryByRole('region', { name: 'Study mode' })).not.toBeInTheDocument()
    expect(answerBoxes()).toHaveLength(0)
    expect(screen.getByRole('button', { name: /columns/i })).toBeInTheDocument()
  })
})

describe('Study Mode: grading in the UI', () => {
  it('all correct → full marks, every box marked ✓', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await fillAll(user, EVERYTHING)
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(screen.getByText(/Score: 15 \/ 15 · 100%/)).toBeInTheDocument()
    expect(verdicts().filter((v) => v.includes('Correct'))).toHaveLength(15)
    expect(answerBoxes().every((b) => !b.hasAttribute('aria-invalid'))).toBe(true)
  })

  it('mixes correct, almost and wrong, names the slip, and awards half marks', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    // first three boxes of the n column: right, "right number but a float", nonsense. Everything else blank.
    const nBoxes = answerBoxes().filter((b) => b.dataset.studyCol === '<module>:n')
    await user.click(nBoxes[0]!)
    await user.paste('1234')
    await user.click(nBoxes[1]!)
    await user.paste('123.0')
    await user.click(nBoxes[2]!)
    await user.paste('oops')
    await user.click(screen.getByRole('button', { name: /check answers/i }))

    expect(screen.getByText(/Score: 1\.5 \/ 15 · 10%/)).toBeInTheDocument()
    expect(screen.getByText(/✓ 1 correct/)).toBeInTheDocument()
    expect(screen.getByText(/≈ 1 almost/)).toBeInTheDocument()
    expect(screen.getByText(/✗ 13 wrong/)).toBeInTheDocument()
    expect(screen.getByText(/Almost — Right number, but it should be an int/)).toBeInTheDocument()
    expect(nBoxes[2]).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getAllByText(/No answer entered/).length).toBe(12)
  })

  it('"Almost" can be set to earn nothing', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const first = answerBoxes()[0]!
    await user.click(first)
    await user.paste('1234.0')
    await user.click(screen.getByLabelText(/“Almost” earns half marks/))
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(screen.getByText(/Score: 0 \/ 15 · 0%/)).toBeInTheDocument()
  })

  it('spaces around an answer cost nothing (the full grading table is in grading.test.ts)', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(answerBoxes()[0]!)
    await user.paste('   1234   ')
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(verdicts()[0]).toContain('Correct')
  })

  it('editing an answer after checking un-grades just that cell and flags the score as out of date', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await fillAll(user, EVERYTHING)
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(screen.getByText(/Score: 15 \/ 15/)).toBeInTheDocument()

    const first = answerBoxes()[0]!
    await user.type(first, '9')
    expect(verdicts().filter((v) => v.includes('Correct'))).toHaveLength(14)
    expect(screen.getByText(/1 answer was changed since you last checked/)).toBeInTheDocument()
    expect(screen.getByText(/Score: 14 \/ 15 · 93%/)).toBeInTheDocument() // the changed cell is pending, so it earns nothing yet
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(screen.getByText(/Score: 14 \/ 15 · 93%/)).toBeInTheDocument() // '12349' is wrong: 14 correct, 1 wrong
    expect(screen.queryByText(/was changed since/)).not.toBeInTheDocument()
  })

  it('shows a per-column breakdown', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await fillAll(user, EVERYTHING)
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    await user.click(screen.getByText('By column'))
    const section = screen.getByRole('region', { name: 'Score' })
    const row = (name: string) => within(section).getByText(name, { selector: 'td' }).closest('tr')!
    expect(row('n')).toHaveTextContent('5 / 5')
    expect(row('total')).toHaveTextContent('5 / 5')
    expect(row('digit')).toHaveTextContent('4 / 4')
    expect(row('Output')).toHaveTextContent('1 / 1')
  })

  it('"Reset answers" clears boxes and the score', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await fillAll(user, EVERYTHING)
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    await user.click(screen.getByRole('button', { name: /reset answers/i }))
    expect(screen.queryByText(/Score:/)).not.toBeInTheDocument()
    expect(answerBoxes().every((b) => b.value === '')).toBe(true)
  })
})

describe('Study Mode: hints and reveal', () => {
  it('Hint gives the shape of the answer, never the answer, and toggles', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const first = answerBoxes()[0]!
    const label = first.getAttribute('aria-label')!
    await user.click(screen.getByRole('button', { name: `Hint for ${label}` }))
    expect(screen.getByText(/Hint: a whole number \(an int\)/)).toBeInTheDocument()
    expect(screen.queryByText(/1234/)).not.toBeInTheDocument()
    expect(first).toHaveAccessibleDescription(/a whole number/)
    await user.click(screen.getByRole('button', { name: `Hint for ${label}` }))
    expect(screen.queryByText(/Hint:/)).not.toBeInTheDocument()
  })

  it('the output cell hint describes the text', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const out = answerBoxes().find((b) => b.dataset.studyCol === 'output')!
    await user.click(out)
    await user.keyboard('{Alt>}h{/Alt}')
    expect(screen.getByText(/Hint: text, 2 characters/)).toBeInTheDocument()
  })

  it('Reveal shows the answer, marks it, and takes it out of the score', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByRole('button', { name: /Reveal Row 1 \(line 1\), n/ }))
    const revealed = screen.getByTestId('revealed-cell')
    expect(revealed).toHaveTextContent('1234')
    expect(revealed).toHaveTextContent('revealed')
    expect(answerBoxes()).toHaveLength(14)

    await fillAll(user, EVERYTHING.slice(1))
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(screen.getByText(/Score: 14 \/ 14 · 100%/)).toBeInTheDocument()
    expect(screen.getByText(/1 revealed \(not scored\)/)).toBeInTheDocument()
  })

  it('a revealed cell stays revealed and un-graded when its neighbours are edited', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByRole('button', { name: /Reveal Row 1 \(line 1\), n/ }))
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    expect(screen.getByTestId('revealed-cell')).toBeInTheDocument()
    expect(useStore.getState().study!.graded).not.toHaveProperty('0:<module>:n')
  })
})

describe('Study Mode: masking', () => {
  it('"Some columns" hides only the chosen ones', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByRole('radio', { name: 'Some columns' }))
    expect(answerBoxes()).toHaveLength(0) // none chosen yet
    expect(screen.getByText(/Nothing is hidden/)).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'total' }))
    expect(answerBoxes()).toHaveLength(5)
    expect(answerBoxes().every((b) => b.dataset.studyCol === '<module>:total')).toBe(true)
    await user.click(screen.getByRole('checkbox', { name: 'Output' }))
    expect(answerBoxes()).toHaveLength(6)
  })

  it('"Random" hides an exact share, and "New random mask" picks a different set and clears answers', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByRole('radio', { name: 'Random' }))
    const pct = screen.getByLabelText('Percentage of cells to hide')
    await user.clear(pct)
    await user.type(pct, '40')
    expect(answerBoxes()).toHaveLength(6) // round(15 × 40%)

    const before = answerBoxes().map((b) => b.dataset.studyKey).join('|')
    await user.click(answerBoxes()[0]!)
    await user.paste('x')
    vi.spyOn(Math, 'random').mockReturnValue(0.123)
    await user.click(screen.getByRole('button', { name: /new random mask/i }))
    expect(answerBoxes()).toHaveLength(6)
    expect(answerBoxes().every((b) => b.value === '')).toBe(true)
    // (a different seed picks different cells; with 15 cells choose-6 a repeat is possible but astronomically unlikely)
    const seed = study().seed
    expect(seed).toBe(Math.floor(0.123 * 4294967296))
    expect(answerBoxes().map((b) => b.dataset.studyKey).join('|')).not.toBe(before)
  })

  it('the same seed hides the same cells after a reload', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByRole('radio', { name: 'Random' }))
    const keys = answerBoxes().map((b) => b.dataset.studyKey)
    const saved = localStorage.getItem(STORAGE_KEY)!
    await user.click(screen.getByRole('button', { name: /exit study mode/i }))
    useStore.setState({ studySessions: {}, studyOrder: [] })
    localStorage.setItem(STORAGE_KEY, saved)
    await act(() => useStore.persist.rehydrate())
    await user.click(toggle())
    expect(answerBoxes().map((b) => b.dataset.studyKey)).toEqual(keys)
  })

  it('"Only hide the Output column" overrides the mode', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(screen.getByLabelText('Only hide the Output column'))
    expect(answerBoxes()).toHaveLength(1)
    expect(answerBoxes()[0]!.dataset.studyCol).toBe('output')
  })

  it('never hides the Line column or the call stack', async () => {
    mount(traces.factorial, { hiddenColumns: [] }) // call stack visible
    const user = userEvent.setup()
    await startStudy(user)
    expect(answerBoxes().some((b) => b.dataset.studyCol === 'line' || b.dataset.studyCol === 'stack')).toBe(false)
    const table = screen.getByRole('table', { name: 'Trace table' })
    expect(within(table).getAllByText(/fact\(n=3\)/).length).toBeGreaterThan(0)
  })
})

describe('Study Mode: the session is frozen', () => {
  it('column and mode changes made elsewhere cannot alter the table being studied', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const headersBefore = within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent)
    act(() => {
      useStore.getState().toggleColumn('<module>:digit')
      useStore.getState().setGranularity('every-line')
      useStore.getState().setDisplayStyle('carry')
    })
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(headersBefore)
    expect(answerBoxes()).toHaveLength(15)
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(16)
    // leaving study mode lets the live settings take effect
    await user.click(screen.getByRole('button', { name: /exit study mode/i }))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(21)
  })

  it('hides the normal table controls while studying', async () => {
    mount()
    await startStudy(userEvent.setup())
    expect(screen.queryByRole('radio', { name: 'Every line' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^columns/i })).not.toBeInTheDocument()
  })

  it('editing the code mid-session warns that the answers belong to the old program', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.type(screen.getByLabelText('Code editor'), '#')
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/answers below belong to the old program/)
    await user.click(within(alert).getByRole('button', { name: /end the session/i }))
    expect(useStore.getState().study).toBeNull()
  })

  it('a re-run of the SAME program keeps the session; a different program ends it', async () => {
    let which = 0
    const { runSpy } = mount(() => (which === 0 ? traces.digitSum : traces.factorial))
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(answerBoxes()[0]!)
    await user.paste('1234')
    await act(() => useStore.getState().run()) // same result again
    expect(useStore.getState().study).not.toBeNull()
    expect(answerBoxes()[0]!.value).toBe('1234')

    which = 1 // now the program yields a different trace (different executionKey)
    await act(() => useStore.getState().run())
    expect(runSpy).toHaveBeenCalledTimes(3)
    expect(useStore.getState().study).toBeNull()
  })

  it('loading a preset or a shared workspace ends the session', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    act(() => useStore.getState().loadPreset('factorial'))
    expect(useStore.getState().study).toBeNull()

    await user.click(toggle()).catch(() => {}) // disabled now (stale): nothing happens
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('print(1)\n'))}`)
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(useStore.getState().study).toBeNull()
  })
})

describe('Study Mode: answers are remembered by program run', () => {
  it('saves answers, mask settings and revealed cells under the executionKey', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(answerBoxes()[0]!)
    await user.paste('1234')
    await user.click(screen.getByRole('button', { name: /Reveal Row 2/ }))
    const key = traces.digitSum.executionKey
    const saved = (stored()!.state.studySessions as Record<string, { answers: Record<string, string>; revealed: string[]; seed: number }>)[key]!
    expect(Object.values(saved.answers)).toEqual(['1234'])
    expect(saved.revealed).toHaveLength(1)
    expect((stored()!.state.studyOrder as string[]).at(-1)).toBe(key)
  })

  it('restores them when the same program is studied again (and says so)', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(answerBoxes()[0]!)
    await user.paste('1234')
    await user.click(screen.getByRole('button', { name: /exit study mode/i }))
    await user.click(toggle())
    expect(answerBoxes()[0]!.value).toBe('1234')
    expect(screen.getByText(/saved answers for this exact program were restored/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /start over/i }))
    expect(answerBoxes()[0]!.value).toBe('')
    expect(screen.queryByText(/were restored/)).not.toBeInTheDocument()
  })

  it('survives a reload of the app', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(answerBoxes()[0]!)
    await user.paste('1234')
    await user.click(screen.getByRole('button', { name: /exit study mode/i }))
    const saved = localStorage.getItem(STORAGE_KEY)!
    useStore.setState({ studySessions: {}, studyOrder: [] }) // a fresh page…
    localStorage.setItem(STORAGE_KEY, saved)
    await act(() => useStore.persist.rehydrate()) // …that reads what was saved
    await user.click(toggle())
    expect(answerBoxes()[0]!.value).toBe('1234')
  })

  it('a different program starts with a clean sheet', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await user.click(answerBoxes()[0]!)
    await user.paste('1234')
    await user.click(screen.getByRole('button', { name: /exit study mode/i }))
    // a different program run
    const runner = new FakeTraceRunner(traces.factorial)
    setRunnerOverride(runner)
    await act(() => useStore.getState().run())
    await user.click(toggle())
    expect(answerBoxes().every((b) => b.value === '')).toBe(true)
    expect(screen.queryByText(/were restored/)).not.toBeInTheDocument()
  })

  it('keeps only the 5 most recent programs', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const ids = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6']
    for (const id of ids) {
      act(() => {
        const st = useStore.getState().study!
        useStore.setState({ study: { ...st, executionKey: id } })
        useStore.getState().setAnswer('1:a', id)
      })
    }
    expect(useStore.getState().studyOrder).toEqual(['k2', 'k3', 'k4', 'k5', 'k6'])
    expect(Object.keys(stored()!.state.studySessions as object).sort()).toEqual(['k2', 'k3', 'k4', 'k5', 'k6'])
  })

  it('answers are capped in length', async () => {
    mount()
    await startStudy(userEvent.setup())
    act(() => useStore.getState().setAnswer('1:a', 'x'.repeat(5000)))
    expect(useStore.getState().study!.answers['1:a']).toHaveLength(500)
  })
})

describe('Study Mode: teacher share links carry the mask settings', () => {
  it('a link with study settings opens with them ready for the next session', async () => {
    const ws = {
      ...defaultWorkspace('print(1)\n'),
      studyConfig: { maskMode: 'random' as const, percent: 30, columns: [], outputOnly: false, closeCredit: 0 as const },
      studySeed: 424242,
    }
    expect(decodeShare(encodeShare(ws))).toMatchObject({ studyConfig: ws.studyConfig, studySeed: 424242 })

    history.replaceState(null, '', `/#s=${encodeShare(ws)}`)
    mount(traces.digitSum, { code: 'mine = 1\n' })
    await screen.findByRole('region', { name: 'Shared workspace' })
    expect(useStore.getState()).toMatchObject({ studyConfig: ws.studyConfig, studySeed: 424242 })
  })

  it('starting a session uses the workspace settings and records the seed', async () => {
    mount(traces.digitSum, {
      studyConfig: { maskMode: 'columns', percent: 50, columns: ['<module>:total'], outputOnly: false, closeCredit: 0.5 },
      studySeed: 99,
    })
    await startStudy(userEvent.setup())
    expect(answerBoxes()).toHaveLength(5)
    expect(study().seed).toBe(99)
  })
})

describe('Study Mode: keyboard', () => {
  it('Enter moves down a column, then to the top of the next, then to Check answers', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const nBoxes = answerBoxes().filter((b) => b.dataset.studyCol === '<module>:n')
    nBoxes[0]!.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(nBoxes[1])
    for (let i = 0; i < 3; i++) await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(nBoxes[4])
    await user.keyboard('{Enter}') // end of the n column
    expect((document.activeElement as HTMLInputElement).dataset.studyCol).toBe('<module>:total')
    expect(document.activeElement).toBe(answerBoxes().find((b) => b.dataset.studyCol === '<module>:total'))
  })

  it('Shift+Enter and the arrow keys go back up', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const nBoxes = answerBoxes().filter((b) => b.dataset.studyCol === '<module>:n')
    nBoxes[2]!.focus()
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(document.activeElement).toBe(nBoxes[1])
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(nBoxes[0])
    await user.keyboard('{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(nBoxes[2])
  })

  it('moves back from the top of a column to the bottom of the previous one', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const total = answerBoxes().filter((b) => b.dataset.studyCol === '<module>:total')
    const n = answerBoxes().filter((b) => b.dataset.studyCol === '<module>:n')
    total[0]!.focus()
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(n[n.length - 1])
  })

  it('past the very last box, Enter lands on Check answers', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const last = answerBoxes().find((b) => b.dataset.studyCol === 'output')!
    last.focus()
    await user.keyboard('{Enter}')
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /check answers/i }))
  })

  it('Space and Enter typed in a box reach the box (they must not be swallowed by the row)', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const out = answerBoxes().find((b) => b.dataset.studyCol === 'output')!
    await user.click(out)
    await user.keyboard('a b')
    expect(out.value).toBe('a b')
  })

  it('Alt+R reveals and moves on to the next box', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const n = answerBoxes().filter((b) => b.dataset.studyCol === '<module>:n')
    n[0]!.focus()
    await user.keyboard('{Alt>}r{/Alt}')
    expect(screen.getByTestId('revealed-cell')).toHaveTextContent('1234')
    expect(document.activeElement).toBe(n[1])
  })

  it('Ctrl+Enter still runs the program (it is not a navigation key)', async () => {
    const { runSpy } = mount()
    const user = userEvent.setup()
    await startStudy(user)
    const before = runSpy.mock.calls.length
    answerBoxes()[0]!.focus()
    await user.keyboard('{Control>}{Enter}{/Control}')
    await waitFor(() => expect(runSpy.mock.calls.length).toBe(before + 1))
    expect(document.activeElement).toBe(answerBoxes()[0]) // and it did not move
  })

  it('focusing a box highlights its row and line, without toggling the selection off', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const second = answerBoxes()[1]!
    const step = Number(second.dataset.studyKey!.split(':')[0])
    await user.click(second)
    expect(useStore.getState().selectedStep).toBe(step)
    await user.click(second) // clicking again must not deselect
    expect(useStore.getState().selectedStep).toBe(step)
    await user.keyboard('{Enter}')
    expect(useStore.getState().selectedStep).toBe(Number((document.activeElement as HTMLInputElement).dataset.studyKey!.split(':')[0]))
  })

  it('rows are not tab stops while studying, so Tab hops from answer to answer', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(rows.every((r) => r.getAttribute('tabindex') === '-1')).toBe(true)
  })

  it('a full quiz with the KEYBOARD ONLY: Tab in, type, Enter down every column, Enter on Check answers', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')

    // 1. reach Study mode with Tab alone, and switch it on with Enter
    for (let i = 0; i < 40 && !(document.activeElement === toggle()); i++) await user.tab()
    expect(document.activeElement).toBe(toggle())
    await user.keyboard('{Enter}')
    await screen.findByRole('region', { name: 'Study mode' })

    // 2. focus has already moved to the first answer box: no tabbing through the page, no mouse anywhere
    await waitFor(() => expect((document.activeElement as HTMLElement | null)?.dataset?.studyKey).toBeTruthy())
    expect((document.activeElement as HTMLInputElement).dataset.studyCol).toBe('<module>:n')
    expect(document.activeElement).toBe(answerBoxes()[0])

    // 3. answer the whole table: type, Enter, type, Enter … down each column, then across
    for (const answer of EVERYTHING) await user.keyboard(`${answer}{Enter}`)

    // 4. the last Enter has landed on Check answers; activate it with the keyboard
    expect(document.activeElement).toBe(screen.getByRole('button', { name: /check answers/i }))
    await user.keyboard('{Enter}')

    expect(screen.getByText(/Score: 15 \/ 15 · 100%/)).toBeInTheDocument()
    expect(answerBoxes().map((b) => b.value)).toEqual(
      // row-major order of the same answers
      answerBoxes().map((b) => {
        const col = b.dataset.studyCol!
        const rowsOfCol = answerBoxes().filter((x) => x.dataset.studyCol === col)
        const base = { '<module>:n': 0, '<module>:total': 5, '<module>:digit': 10, output: 14 }[col]!
        return EVERYTHING[base + rowsOfCol.indexOf(b)]!
      }),
    )
  })

  it('the same quiz with deliberate mistakes is marked correctly, by keyboard', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    await waitFor(() => expect(document.activeElement).toBe(answerBoxes()[0])) // toggling Study mode focuses the first box
    const wrong = [...EVERYTHING]
    wrong[1] = '124' // wrong n
    wrong[7] = '7.0' // total's third answer is the int 7: right number, float spelling = almost
    wrong[12] = '' // blank
    wrong[14] = 'ten' // wrong output
    for (const answer of wrong) await user.keyboard(answer === '' ? '{Enter}' : `${answer}{Enter}`)
    await user.keyboard('{Enter}') // Check answers
    // 11 correct + 1 almost (half) = 11.5 of 15
    expect(screen.getByText(/Score: 11\.5 \/ 15 · 77%/)).toBeInTheDocument()
    expect(screen.getByText(/≈ 1 almost/)).toBeInTheDocument()
    expect(screen.getByText(/✗ 3 wrong/)).toBeInTheDocument()
  })
})

describe('Study Mode: store guards', () => {
  it('startStudy does nothing without a usable, current table', async () => {
    mount(traces.syntaxError)
    await screen.findByRole('alert')
    act(() => useStore.getState().startStudy())
    expect(useStore.getState().study).toBeNull() // no rows
  })

  it('actions on a session that is not running do nothing', () => {
    mount()
    act(() => {
      useStore.getState().setAnswer('1:a', 'x')
      useStore.getState().revealCell('1:a')
      useStore.getState().checkAnswers()
      useStore.getState().resetAnswers()
      useStore.getState().reshuffleStudy()
      useStore.getState().setStudyConfig({ percent: 5 })
    })
    expect(useStore.getState().study).toBeNull()
    expect(useStore.getState().studySessions).toEqual({})
  })

  it('checkAnswers ignores answers for cells that are not masked or are revealed', async () => {
    mount()
    const user = userEvent.setup()
    await startStudy(user)
    act(() => {
      useStore.getState().setAnswer('99999:nope', 'junk')
      useStore.getState().revealCell('0:<module>:n')
      useStore.getState().checkAnswers()
    })
    const graded = study().graded!
    expect(Object.keys(graded)).toHaveLength(14)
    expect(graded).not.toHaveProperty('99999:nope')
    expect(graded).not.toHaveProperty('0:<module>:n')
  })
})
