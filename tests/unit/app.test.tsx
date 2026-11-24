import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { encodeShare } from '../../src/core/share/urlState'
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
type Validate = (expr: string) => { ok: true } | { ok: false; message: string }

const CLEAN = {
  result: null,
  ranSig: null,
  running: false,
  hoverStep: null,
  selectedStep: null,
  watchErrors: {},
  shared: null,
  sharedLinkInvalid: false,
}

/** Fresh workspace + a FakeTraceRunner. The app auto-runs once the runtime is ready (like a real page load). */
function mount(result: Result = traces.digitSum, opts: { validate?: Validate; workspace?: Partial<ReturnType<typeof defaultWorkspace>> } = {}) {
  const runner = new FakeTraceRunner(result, 'python', opts.validate)
  const runSpy = vi.spyOn(runner, 'runTrace')
  setRunnerOverride(runner)
  useStore.setState({ ...defaultWorkspace('x = 1\n'), ...opts.workspace, ...CLEAN })
  render(<App />)
  return { runner, runSpy }
}

const table = () => screen.getByRole('table', { name: 'Trace table' })
const bodyRows = () => within(table()).getAllByRole('row').slice(1)
const headers = () => within(table()).getAllByRole('columnheader').map((h) => h.textContent)
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { state: Record<string, unknown> } | null

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun() // a queued "re-run soon" must not leak into the next test
  setRunnerOverride(null)
  vi.restoreAllMocks()
})

describe('App: running and the table', () => {
  it('runs automatically once Python is ready and shows the COMPACT exam table', async () => {
    mount()
    expect(await screen.findByText('Python ready')).toBeInTheDocument()
    await screen.findByRole('table', { name: 'Trace table' })
    expect(headers()).toEqual(['Line', 'n', 'total', 'digit', 'Output'])
    expect(bodyRows()).toHaveLength(15) // the 5 `while` tests change nothing, so they are dropped
    expect(screen.getByRole('radio', { name: 'Compact' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Exam blanks' })).toBeChecked()
  })

  it('the Run button runs again', async () => {
    const { runSpy } = mount()
    await screen.findByRole('table')
    await userEvent.setup().click(screen.getByRole('button', { name: /run/i }))
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(2))
  })

  it('"Every line" shows all 20 executed lines, instantly, without re-running', async () => {
    const { runSpy } = mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('radio', { name: 'Every line' }))
    expect(bodyRows()).toHaveLength(20)
    await user.click(screen.getByRole('radio', { name: 'Compact' }))
    expect(bodyRows()).toHaveLength(15)
    expect(runSpy).toHaveBeenCalledTimes(1)
  })

  it('"Carry forward" fills in unchanged cells, "Exam blanks" leaves them empty', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    const nCells = () => bodyRows().map((r) => within(r).getAllByRole('cell')[1]!.textContent)
    expect(nCells().slice(0, 3)).toEqual(['1234', '', ''])
    await user.click(screen.getByRole('radio', { name: 'Carry forward' }))
    expect(nCells().slice(0, 3)).toEqual(['1234', '1234', '1234'])
  })

  it('shows T / F chips for loop-condition rows in Every line mode', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('radio', { name: 'Every line' }))
    expect(within(table()).getAllByLabelText('condition true')).toHaveLength(4)
    expect(within(table()).getAllByLabelText('condition false')).toHaveLength(1)
  })

  it('hovering a row sets the hovered step; clicking toggles the selected step (drives editor highlight)', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    const row = bodyRows()[3]!
    await user.hover(row)
    expect(useStore.getState().hoverStep).toBe(Number(row.getAttribute('data-step')))
    await user.click(row)
    expect(useStore.getState().selectedStep).toBe(useStore.getState().hoverStep)
    expect(row).toHaveAttribute('aria-current', 'true')
    await user.click(row)
    expect(useStore.getState().selectedStep).toBeNull()
    await user.unhover(row)
    expect(useStore.getState().hoverStep).toBeNull()
  })

  it('rows are keyboard reachable: Enter selects', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    bodyRows()[0]!.focus()
    await user.keyboard('{Enter}')
    expect(useStore.getState().selectedStep).toBe(0)
  })

  it('shows an error banner AND the partial table for a runtime error', async () => {
    mount(traces.zeroDivision)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your program crashed')
    expect(alert).toHaveTextContent('line 2')
    expect(alert).toHaveTextContent('ZeroDivisionError: division by zero')
    expect(screen.getByRole('table', { name: 'Trace table' })).toBeInTheDocument()
  })

  it('shows a syntax error with no table and no table controls', async () => {
    mount(traces.syntaxError)
    expect(await screen.findByRole('alert')).toHaveTextContent('Syntax error')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('tells the user how to fix a step-limit stop', async () => {
    mount(traces.infiniteLoop)
    expect(await screen.findByRole('alert')).toHaveTextContent('Stopped: too many steps')
    expect(screen.getByRole('alert')).toHaveTextContent('steps recorded before it stopped')
  })

  it('marks the table stale when the code is edited after a run', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Code editor'), '#')
    expect(await screen.findByText(/have changed since this table was generated/i)).toBeInTheDocument()
  })
})

describe('App: input() flow', () => {
  it('asks for the missing input inline, appends it to Program inputs and re-runs', async () => {
    const seen: string[][] = []
    mount((_code, o) => {
      seen.push(o.stdin)
      return o.stdin.length === 0 ? traces.needsInput : traces.digitSum
    })
    const user = userEvent.setup()
    const answer = await screen.findByLabelText('Your answer')
    expect(screen.getByText(/the program asked:/i)).toHaveTextContent('Name?')
    expect(screen.getByRole('alert')).toHaveTextContent('Your program needs more input')

    await user.type(answer, 'Ada')
    await user.click(screen.getByRole('button', { name: /add answer/i }))

    expect(seen).toEqual([[], ['Ada']])
    expect(screen.getByLabelText(/program inputs/i)).toHaveValue('Ada')
    expect(await screen.findByRole('table', { name: 'Trace table' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Your answer')).not.toBeInTheDocument()
  })

  it('appends to existing inputs on a new line', async () => {
    mount(traces.needsInput)
    useStore.setState({ stdinText: 'first\n' })
    await act(() => useStore.getState().answerInput('second'))
    expect(useStore.getState().stdinText).toBe('first\nsecond')
  })
})

describe('Column Manager', () => {
  const open = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /columns/i }))
    return screen.getByRole('dialog', { name: 'Columns' })
  }

  it('lists every available column with a checkbox, and shows the counts', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    expect(within(dlg).getAllByRole('checkbox').slice(0, 5).map((c) => (c as HTMLInputElement).checked)).toEqual([true, true, true, true, true])
    expect(screen.getByRole('button', { name: /columns \(5\/5\)/i })).toBeInTheDocument()
  })

  it('unticking a variable hides its column AND the rows that only changed it (Compact)', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    await user.click(within(dlg).getByRole('checkbox', { name: 'digit' }))
    expect(headers()).toEqual(['Line', 'n', 'total', 'Output'])
    expect(bodyRows()).toHaveLength(11) // the four `digit = n % 10` rows are gone
    expect(useStore.getState().hiddenColumns).toContain('<module>:digit')
  })

  it('can hide Line and Output too, and bring columns back', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    await user.click(within(dlg).getByRole('checkbox', { name: 'Line' }))
    await user.click(within(dlg).getByRole('checkbox', { name: 'Output' }))
    expect(headers()).toEqual(['n', 'total', 'digit'])
    await user.click(within(dlg).getByRole('checkbox', { name: 'Output' }))
    expect(headers()).toEqual(['n', 'total', 'digit', 'Output'])
  })

  it('reorders variable columns with the move buttons', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    await user.click(within(dlg).getByRole('button', { name: 'Move n left' }).hasAttribute('disabled') ? within(dlg).getByRole('button', { name: 'Move n right' }) : within(dlg).getByRole('button', { name: 'Move n left' }))
    expect(headers()).toEqual(['Line', 'total', 'n', 'digit', 'Output'])
    await user.click(within(dlg).getByRole('button', { name: 'Move digit left' }))
    expect(headers()).toEqual(['Line', 'total', 'digit', 'n', 'Output'])
    expect(useStore.getState().columnOrder).toEqual(['<module>:total', '<module>:digit', '<module>:n'])
  })

  it('disables the move buttons at the ends', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    expect(within(dlg).getByRole('button', { name: 'Move n left' })).toBeDisabled()
    expect(within(dlg).getByRole('button', { name: 'Move digit right' })).toBeDisabled()
  })

  it('Reset restores the default columns', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    await user.click(within(dlg).getByRole('checkbox', { name: 'digit' }))
    await user.click(within(dlg).getByRole('button', { name: 'Move n right' }))
    await user.click(within(dlg).getByRole('button', { name: /reset columns/i }))
    expect(headers()).toEqual(['Line', 'n', 'total', 'digit', 'Output'])
  })

  it('the call-stack column exists but starts hidden; ticking it shows the call chain', async () => {
    mount(traces.factorial)
    const user = userEvent.setup()
    const dlg = await open(user)
    expect(headers()).not.toContain('Call stack')
    await user.click(within(dlg).getByRole('checkbox', { name: 'Call stack' }))
    expect(headers()).toContain('Call stack')
    expect(within(table()).getAllByText('fact(n=3) › fact(n=2)').length).toBeGreaterThan(0)
  })

  it('"Show functions & modules" re-runs the program with showCallables on', async () => {
    const seen: boolean[] = []
    mount((_c, o) => {
      seen.push(o.showCallables)
      return traces.digitSum
    })
    const user = userEvent.setup()
    const dlg = await open(user)
    await user.click(within(dlg).getByRole('checkbox', { name: /show functions/i }))
    await waitFor(() => expect(seen).toEqual([false, true]), { timeout: 3000 })
  })

  it('closes on Escape and on an outside click', async () => {
    mount()
    const user = userEvent.setup()
    await open(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Columns' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /columns/i }))
    await user.click(document.body)
    expect(screen.queryByRole('dialog', { name: 'Columns' })).not.toBeInTheDocument()
  })

  it('the choice is remembered (persisted) and survives a reload of the store', async () => {
    mount()
    const user = userEvent.setup()
    const dlg = await open(user)
    await user.click(within(dlg).getByRole('checkbox', { name: 'digit' }))
    expect(stored()?.state.hiddenColumns).toEqual(['stack', '<module>:digit'])
    const saved = localStorage.getItem(STORAGE_KEY)!
    useStore.setState({ hiddenColumns: [] }) // simulate a fresh page (this write is persisted too, so put the real data back)…
    localStorage.setItem(STORAGE_KEY, saved)
    await act(() => useStore.persist.rehydrate()) // …that reads localStorage
    expect(useStore.getState().hiddenColumns).toEqual(['stack', '<module>:digit'])
  })
})

describe('queued re-runs', () => {
  const queueRerun = () => act(() => useStore.getState().setShowCallables(true)) // schedules a re-run in 500 ms

  it('a re-run queued for the old workspace does not fire after loading a preset', async () => {
    const { runSpy } = mount()
    await screen.findByRole('table')
    queueRerun()
    act(() => useStore.getState().loadPreset('factorial'))
    await act(async () => { await new Promise((r) => setTimeout(r, 700)) })
    expect(runSpy).toHaveBeenCalledTimes(1) // only the initial run
  })

  it('...nor after a shared link replaces the workspace', async () => {
    const { runSpy } = mount()
    await screen.findByRole('table')
    queueRerun()
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('print("shared")\n'))}`)
    await act(async () => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
      await new Promise((r) => setTimeout(r, 700))
    })
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('a queued re-run still fires when nothing replaced the workspace', async () => {
    const { runSpy } = mount()
    await screen.findByRole('table')
    queueRerun()
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(2), { timeout: 3000 })
  })
})

describe('Watch panel', () => {
  const rejectPop: Validate = (e) =>
    /\.pop\(/.test(e) ? { ok: false, message: "Watch expressions can't call .pop() — it would change your program's state." } : { ok: true }

  it('adds, edits and removes watches', async () => {
    mount(traces.digitSum, { validate: rejectPop })
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /add watch/i }))
    const input = screen.getByLabelText('Watch expression 1')
    await user.type(input, 'n % 10')
    expect(useStore.getState().watches).toMatchObject([{ expr: 'n % 10', scope: { kind: 'current' }, enabled: true }])
    await user.click(screen.getByRole('button', { name: 'Remove watch 1' }))
    expect(useStore.getState().watches).toEqual([])
    expect(screen.queryByLabelText('Watch expression 1')).not.toBeInTheDocument()
  })

  it('rejects arr.pop() with a helpful message, marks the field invalid, and clears it when fixed', async () => {
    mount(traces.digitSum, { validate: rejectPop })
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /add watch/i }))
    const input = screen.getByLabelText('Watch expression 1')
    await user.type(input, 'arr.pop()')
    const msg = await screen.findByText(/can't call \.pop\(\)/)
    expect(msg).toHaveTextContent("change your program's state")
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription(/can't call \.pop\(\)/)

    await user.clear(input)
    await user.type(input, 'len(arr)')
    await waitFor(() => expect(screen.queryByText(/can't call \.pop\(\)/)).not.toBeInTheDocument())
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('ignores a stale validation answer for an expression that was edited again', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const runner = new FakeTraceRunner(traces.digitSum)
    runner.validateWatch = async (e) => {
      if (e === 'a.pop()') await gate // slow answer for the OLD text
      return /pop/.test(e) ? { ok: false, message: 'old text was bad' } : { ok: true }
    }
    setRunnerOverride(runner)
    useStore.setState({ ...defaultWorkspace('x = 1\n'), ...CLEAN })
    render(<App />)
    await screen.findByRole('table')
    const id = useStore.getState().addWatch('a.pop()')!
    useStore.getState().updateWatch(id, { expr: 'a' }) // edited again before the slow answer returns
    await waitFor(() => expect(useStore.getState().watchErrors).toEqual({}))
    release()
    await act(async () => { await gate })
    expect(useStore.getState().watchErrors).toEqual({}) // the late "bad" answer was dropped
  })

  it('shows a watch as a column with its values', async () => {
    mount((_c, o) => (o.watches.length ? traces.watchesLoop : traces.digitSum), {
      workspace: { watches: [{ id: 'cond', expr: 'i < n', scope: { kind: 'current' }, enabled: true }] },
    })
    await screen.findByRole('table')
    expect(headers()).toContain('i < n')
    const col = headers().indexOf('i < n')
    const values = bodyRows().map((r) => within(r).getAllByRole('cell')[col]!.textContent)
    expect(values).toContain('True')
    expect(values).toContain('False')
  })

  it('a disabled watch is not sent to the runner', async () => {
    const seen: number[] = []
    mount((_c, o) => {
      seen.push(o.watches.filter((w) => w.enabled).length)
      return traces.digitSum
    }, { workspace: { watches: [{ id: 'cond', expr: 'i < n', scope: { kind: 'current' }, enabled: false }] } })
    await screen.findByRole('table')
    expect(seen).toEqual([0])
  })

  it('changing a watch marks the table stale', async () => {
    mount()
    await screen.findByRole('table')
    act(() => void useStore.getState().addWatch('n'))
    expect(await screen.findByText(/have changed since this table was generated/i)).toBeInTheDocument()
  })

  it('offers watch scopes: current, module, and the functions seen in the last run', async () => {
    mount(traces.factorial, { workspace: { watches: [{ id: 'w', expr: 'n', scope: { kind: 'current' }, enabled: true }] } })
    await screen.findByRole('table')
    const select = screen.getByLabelText('Scope of watch 1')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Current frame', 'Module (globals)', 'In fact()'])
    await userEvent.setup().selectOptions(select, 'fn:fact')
    expect(useStore.getState().watches[0]!.scope).toEqual({ kind: 'function', name: 'fact' })
  })

  it('stops at 20 watches', async () => {
    mount()
    await screen.findByRole('table')
    act(() => {
      for (let i = 0; i < 25; i++) useStore.getState().addWatch()
    })
    expect(useStore.getState().watches).toHaveLength(20)
    expect(screen.getByRole('button', { name: /add watch/i })).toBeDisabled()
  })
})

describe('Share', () => {
  const stubClipboard = (impl: () => Promise<void>) => {
    const writeText = vi.fn(impl)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    return writeText
  }

  it('creates a #s= link from the current workspace and copies it', async () => {
    const user = userEvent.setup() // installs its own clipboard stub, so stub OURS afterwards
    const writeText = stubClipboard(async () => {})
    mount(traces.digitSum, { workspace: { code: 'print(42)\n', hiddenColumns: ['stack', 'line'] } })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /share/i }))
    const dlg = await screen.findByRole('dialog', { name: 'Share link' })
    const url = (within(dlg).getByLabelText('Share link') as HTMLInputElement).value
    expect(url).toContain('#s=')
    expect(writeText).toHaveBeenCalledWith(url)
    expect(await within(dlg).findByText(/link copied/i)).toBeInTheDocument()
    expect(dlg).toHaveTextContent('Whoever opens it must press Run themselves')
  })

  it('selects the link for manual copying when the clipboard is blocked', async () => {
    const user = userEvent.setup()
    stubClipboard(async () => {
      throw new Error('NotAllowedError')
    })
    mount()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /share/i }))
    expect(await screen.findByText(/couldn’t copy automatically/i)).toBeInTheDocument()
  })

  it('warns about very long links', async () => {
    const user = userEvent.setup()
    stubClipboard(async () => {})
    const noisy = Array.from({ length: 800 }, (_, i) => `v${i} = ${Math.sin(i)}`).join('\n')
    mount(traces.digitSum, { workspace: { code: noisy } })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /share/i }))
    expect(await screen.findByText(/this link is long/i)).toBeInTheDocument()
  })
})

describe('Opening a shared link', () => {
  const share = (code: string, extra = {}) => `#s=${encodeShare({ ...defaultWorkspace(code), ...extra })}`
  const mountShared = (hash: string, workspace = { code: 'mine = 1\n' }) => {
    history.replaceState(null, '', `/${hash}`)
    // the user's own workspace is saved in localStorage like a real returning visitor
    const result = mount(traces.digitSum, { workspace })
    return result
  }

  it('shows a banner, loads the code, and does NOT run it', async () => {
    const { runSpy } = mountShared(share('print("shared")\n'))
    expect(await screen.findByRole('region', { name: 'Shared workspace' })).toHaveTextContent('Nothing has been run')
    expect(screen.getByLabelText('Code editor')).toHaveValue('print("shared")\n')
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(runSpy).not.toHaveBeenCalled()
    expect(screen.getByText(/to generate the trace table/i)).toBeInTheDocument()
  })

  it('the user must press Run themselves', async () => {
    const { runSpy } = mountShared(share('print("shared")\n'))
    await screen.findByRole('region', { name: 'Shared workspace' })
    await userEvent.setup().click(screen.getByRole('button', { name: /^▶ run/i }))
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1))
  })

  it('applies the shared view settings and watches too', async () => {
    mountShared(
      share('n = 1\n', {
        granularity: 'every-line',
        displayStyle: 'carry',
        hiddenColumns: ['stack', 'line'],
        watches: [{ id: 'w', expr: 'n * 2', scope: { kind: 'module' }, enabled: true }],
      }),
    )
    await screen.findByRole('region', { name: 'Shared workspace' })
    // no table yet (nothing has been run), so check the settings that the table will use once the user runs it
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(useStore.getState()).toMatchObject({ granularity: 'every-line', displayStyle: 'carry', hiddenColumns: ['stack', 'line'] })
    expect(screen.getByLabelText('Watch expression 1')).toHaveValue('n * 2')
  })

  it('keeps the visitor’s OWN workspace in storage while the shared one is under review', async () => {
    mountShared(share('print("shared")\n'))
    await screen.findByRole('region', { name: 'Shared workspace' })
    await userEvent.setup().type(screen.getByLabelText('Code editor'), '# edit')
    const persisted = JSON.stringify(stored())
    expect(persisted).toContain('mine = 1')
    expect(persisted).not.toContain('shared')
    expect(persisted).not.toContain('# edit')
  })

  it('Keep makes the shared workspace the visitor’s own (and persists it) and removes the hash', async () => {
    mountShared(share('print("shared")\n'))
    await userEvent.setup().click(await screen.findByRole('button', { name: /keep this workspace/i }))
    expect(screen.queryByRole('region', { name: 'Shared workspace' })).not.toBeInTheDocument()
    expect(location.hash).toBe('')
    expect(JSON.stringify(stored())).toContain('shared')
  })

  it('Discard restores the visitor’s own workspace untouched, and brings their table back', async () => {
    const { runSpy } = mountShared(share('print("shared")\n'))
    await userEvent.setup().click(await screen.findByRole('button', { name: /discard & restore mine/i }))
    expect(screen.queryByRole('region', { name: 'Shared workspace' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Code editor')).toHaveValue('mine = 1\n')
    expect(location.hash).toBe('')
    expect(JSON.stringify(stored())).toContain('mine = 1')
    await waitFor(() => expect(runSpy).toHaveBeenCalledTimes(1)) // own code only; the shared code never ran
    expect(runSpy.mock.calls[0]![0]).toBe('mine = 1\n')
    expect(await screen.findByRole('table', { name: 'Trace table' })).toBeInTheDocument()
  })

  describe('a link pasted into a tab that already has the app open (hashchange, no reload)', () => {
    const arrive = async (hash: string) => {
      history.replaceState(null, '', `/${hash}`)
      await act(async () => {
        window.dispatchEvent(new HashChangeEvent('hashchange'))
      })
    }

    it('loads for review, drops the old table, and does not run the new code', async () => {
      const { runSpy } = mount(traces.digitSum, { workspace: { code: 'mine = 1\n' } })
      await screen.findByRole('table') // the visitor already has a table on screen
      expect(runSpy).toHaveBeenCalledTimes(1)

      await arrive(share('print("shared")\n'))

      expect(await screen.findByRole('region', { name: 'Shared workspace' })).toBeInTheDocument()
      expect(screen.getByLabelText('Code editor')).toHaveValue('print("shared")\n')
      expect(screen.queryByRole('table')).not.toBeInTheDocument() // the old table was for the old code
      await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
      expect(runSpy).toHaveBeenCalledTimes(1) // never auto-run
    })

    it('Discard brings back the code the visitor had open', async () => {
      mount(traces.digitSum, { workspace: { code: 'mine = 1\n' } })
      await screen.findByRole('table')
      await arrive(share('print("shared")\n'))
      await userEvent.setup().click(await screen.findByRole('button', { name: /discard & restore mine/i }))
      expect(screen.getByLabelText('Code editor')).toHaveValue('mine = 1\n')
    })

    it('a second link while the first is under review does not turn the first into "mine"', async () => {
      mount(traces.digitSum, { workspace: { code: 'mine = 1\n' } })
      await screen.findByRole('table')
      await arrive(share('print("first")\n'))
      await arrive(share('print("second")\n'))
      expect(screen.getByLabelText('Code editor')).toHaveValue('print("second")\n')
      expect(JSON.stringify(stored())).toContain('mine = 1') // still the visitor's own workspace in storage
      await userEvent.setup().click(screen.getByRole('button', { name: /discard & restore mine/i }))
      expect(screen.getByLabelText('Code editor')).toHaveValue('mine = 1\n') // not "first"
    })

    it('a run still in flight for the old code cannot land on the shared workspace', async () => {
      let finish!: (r: TraceResult) => void
      const slow = new Promise<TraceResult>((r) => (finish = r))
      const runner = new FakeTraceRunner(traces.digitSum)
      runner.runTrace = () => slow // never completes until we say so
      vi.spyOn(runner, 'cancel')
      setRunnerOverride(runner)
      useStore.setState({ ...defaultWorkspace('mine = 1\n'), ...CLEAN })
      render(<App />)
      await waitFor(() => expect(useStore.getState().running).toBe(true))

      await arrive(share('print("shared")\n'))
      finish(traces.digitSum) // the OLD run completes now
      await act(async () => { await slow })

      expect(useStore.getState().result).toBeNull()
      expect(useStore.getState().running).toBe(false)
      expect(runner.cancel).toHaveBeenCalled()
    })

    it('a damaged link arriving late is reported and changes nothing', async () => {
      mount(traces.digitSum, { workspace: { code: 'mine = 1\n' } })
      await screen.findByRole('table')
      await arrive('#s=broken-link')
      expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t be read/i)
      expect(screen.getByLabelText('Code editor')).toHaveValue('mine = 1\n')
      expect(screen.getByRole('table', { name: 'Trace table' })).toBeInTheDocument()
    })

    it('ignores hash changes that are not share links', async () => {
      mount(traces.digitSum, { workspace: { code: 'mine = 1\n' } })
      await screen.findByRole('table')
      await arrive('#section-2')
      expect(screen.queryByRole('region', { name: 'Shared workspace' })).not.toBeInTheDocument()
      expect(screen.getByRole('table', { name: 'Trace table' })).toBeInTheDocument()
    })
  })

  it('an unreadable link leaves the workspace alone and says so', async () => {
    mountShared('#s=this-is-not-a-valid-payload')
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn’t be read/i)
    expect(screen.getByLabelText('Code editor')).toHaveValue('mine = 1\n')
    expect(location.hash).toBe('')
    await userEvent.setup().click(screen.getByRole('button', { name: /dismiss/i }))
    expect(screen.queryByText(/couldn’t be read/i)).not.toBeInTheDocument()
  })
})

describe('Persistence', () => {
  it('survives corrupt or hostile localStorage without crashing or taking the data', async () => {
    mount()
    await screen.findByRole('table')
    for (const junk of ['{not json', 'null', '[]', '{"state":{"code":123,"granularity":"x"},"version":1}', '{"state":{},"version":99}']) {
      localStorage.setItem(STORAGE_KEY, junk)
      await act(() => useStore.persist.rehydrate())
      const s = useStore.getState()
      expect(typeof s.code).toBe('string')
      expect(['compact', 'every-line']).toContain(s.granularity)
      expect(Array.isArray(s.watches)).toBe(true)
    }
  })

  it('restores code, inputs, view settings and watches', async () => {
    mount()
    await screen.findByRole('table')
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        state: {
          ...defaultWorkspace('saved = 1\n', 'a\nb'),
          granularity: 'every-line',
          displayStyle: 'carry',
          watches: [{ id: 'w1', expr: 'saved', scope: { kind: 'module' }, enabled: true }],
        },
      }),
    )
    await act(() => useStore.persist.rehydrate())
    expect(useStore.getState()).toMatchObject({
      code: 'saved = 1\n',
      stdinText: 'a\nb',
      granularity: 'every-line',
      displayStyle: 'carry',
      watches: [{ id: 'w1', expr: 'saved', scope: { kind: 'module' }, enabled: true }],
    })
  })

  it('does not persist results or transient UI state', async () => {
    mount()
    await screen.findByRole('table')
    act(() => useStore.getState().selectStep(2))
    const keys = Object.keys(stored()!.state).sort()
    // the workspace + remembered study sessions, and nothing else (no result, no live `study`, no hover/selection)
    expect(keys).toEqual([...Object.keys(defaultWorkspace()), 'studyOrder', 'studySessions'].sort())
    expect(keys).not.toContain('study')
    expect(JSON.stringify(stored())).not.toContain('steps')
  })
})
