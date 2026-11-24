import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import type { TraceOptions, TraceResult } from '../../src/core/types'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

// CodeMirror needs real layout APIs jsdom doesn't have; the editor is covered in the browser.
vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => {
    const { code, setCode } = useStore()
    return <textarea aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
  },
}))

function mount(result: TraceResult | ((code: string, o: TraceOptions) => TraceResult) = traces.digitSum) {
  setRunnerOverride(new FakeTraceRunner(result))
  useStore.setState({
    result: null,
    ranCode: null,
    running: false,
    hoverStep: null,
    selectedStep: null,
    granularity: 'compact',
    displayStyle: 'exam',
    stdinText: '',
  })
  return render(<App />)
}

const run = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(await screen.findByRole('button', { name: /run/i }))
const bodyRows = () => within(screen.getByRole('table', { name: 'Trace table' })).getAllByRole('row').slice(1)

describe('App (with FakeTraceRunner)', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    setRunnerOverride(null)
  })

  it('starts with an empty state and a ready Run button', async () => {
    mount()
    expect(screen.getByText(/to generate the trace table/i)).toBeInTheDocument()
    expect(await screen.findByText('Python ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /run/i })).toBeEnabled()
  })

  it('Run renders the COMPACT exam table by default', async () => {
    mount()
    await run(userEvent.setup())
    const table = await screen.findByRole('table', { name: 'Trace table' })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Line', 'n', 'total', 'digit', 'Output'])
    expect(bodyRows()).toHaveLength(15) // the 5 `while` tests change nothing, so they are dropped
    expect(screen.getByRole('radio', { name: 'Compact' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Exam blanks' })).toBeChecked()
  })

  it('"Every line" shows all 20 executed lines, instantly, without re-running', async () => {
    const runner = new FakeTraceRunner(traces.digitSum)
    const spy = vi.spyOn(runner, 'runTrace')
    setRunnerOverride(runner)
    useStore.setState({ result: null, ranCode: null, granularity: 'compact', displayStyle: 'exam' })
    render(<App />)
    const user = userEvent.setup()
    await run(user)
    await screen.findByRole('table')
    await user.click(screen.getByRole('radio', { name: 'Every line' }))
    expect(bodyRows()).toHaveLength(20)
    await user.click(screen.getByRole('radio', { name: 'Compact' }))
    expect(bodyRows()).toHaveLength(15)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('"Carry forward" fills in unchanged cells, "Exam blanks" leaves them empty', async () => {
    mount()
    const user = userEvent.setup()
    await run(user)
    await screen.findByRole('table')
    const nCells = () => bodyRows().map((r) => within(r).getAllByRole('cell')[1]!.textContent)
    expect(nCells().slice(0, 3)).toEqual(['1234', '', '']) // n only shown where written
    await user.click(screen.getByRole('radio', { name: 'Carry forward' }))
    expect(nCells().slice(0, 3)).toEqual(['1234', '1234', '1234'])
  })

  it('shows T / F chips for loop-condition rows in Every line mode', async () => {
    mount()
    const user = userEvent.setup()
    await run(user)
    await screen.findByRole('table')
    await user.click(screen.getByRole('radio', { name: 'Every line' }))
    const table = screen.getByRole('table', { name: 'Trace table' })
    expect(within(table).getAllByLabelText('condition true')).toHaveLength(4)
    expect(within(table).getAllByLabelText('condition false')).toHaveLength(1)
  })

  it('hovering a row sets the hovered step; clicking toggles the selected step (drives editor highlight)', async () => {
    mount()
    const user = userEvent.setup()
    await run(user)
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
    await run(user)
    await screen.findByRole('table')
    const row = bodyRows()[0]!
    row.focus()
    await user.keyboard('{Enter}')
    expect(useStore.getState().selectedStep).toBe(0)
  })

  it('shows an error banner AND the partial table for a runtime error', async () => {
    mount(traces.zeroDivision)
    await run(userEvent.setup())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your program crashed')
    expect(alert).toHaveTextContent('line 2')
    expect(alert).toHaveTextContent('ZeroDivisionError: division by zero')
    expect(screen.getByRole('table', { name: 'Trace table' })).toBeInTheDocument()
  })

  it('shows a syntax error with no table and no table controls', async () => {
    mount(traces.syntaxError)
    await run(userEvent.setup())
    expect(await screen.findByRole('alert')).toHaveTextContent('Syntax error')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument()
  })

  it('tells the user how to fix a step-limit stop', async () => {
    mount(traces.infiniteLoop)
    await run(userEvent.setup())
    expect(await screen.findByRole('alert')).toHaveTextContent('Stopped: too many steps')
    expect(screen.getByRole('alert')).toHaveTextContent('steps recorded before it stopped')
  })

  it('marks the table stale when the code is edited after a run', async () => {
    mount()
    const user = userEvent.setup()
    await run(user)
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Code editor'), '#')
    expect(await screen.findByText(/code has changed since this table was generated/i)).toBeInTheDocument()
  })
})

describe('input() flow', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => {
    cleanup()
    setRunnerOverride(null)
  })

  it('asks for the missing input inline, appends it to Program inputs and re-runs', async () => {
    const seen: string[][] = []
    mount((_code, o) => {
      seen.push(o.stdin)
      return o.stdin.length === 0 ? traces.needsInput : traces.digitSum
    })
    const user = userEvent.setup()
    await run(user)

    const answer = await screen.findByLabelText('Your answer')
    expect(screen.getByText(/the program asked:/i)).toHaveTextContent('Name?') // the prompt is shown inline
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
    await useStore.getState().answerInput('second')
    expect(useStore.getState().stdinText).toBe('first\nsecond')
  })
})
