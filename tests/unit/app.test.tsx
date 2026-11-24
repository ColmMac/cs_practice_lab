import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
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

function mount(result = traces.digitSum) {
  setRunnerOverride(new FakeTraceRunner(result))
  useStore.setState({ result: null, ranCode: null, running: false })
  return render(<App />)
}

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

  it('Run renders the trace table with column headers and carried-forward values', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /run/i }))
    const table = await screen.findByRole('table', { name: 'Trace table' })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers).toEqual(['Line', 'n', 'total', 'digit', 'Output'])
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 20) // header + one per executed line
    expect(within(table).getAllByText('10').length).toBeGreaterThan(0)
  })

  it('shows an error banner AND the partial table for a runtime error', async () => {
    mount(traces.zeroDivision)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /run/i }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your program crashed')
    expect(alert).toHaveTextContent('line 2')
    expect(alert).toHaveTextContent('ZeroDivisionError: division by zero')
    expect(screen.getByRole('table', { name: 'Trace table' })).toBeInTheDocument()
  })

  it('shows a syntax error with no table', async () => {
    mount(traces.syntaxError)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /run/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Syntax error')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('tells the user how to fix a step-limit stop', async () => {
    mount(traces.infiniteLoop)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /run/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Stopped: too many steps')
    expect(screen.getByRole('alert')).toHaveTextContent('steps recorded before it stopped')
  })

  it('marks the table stale when the code is edited after a run', async () => {
    mount()
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /run/i }))
    await screen.findByRole('table')
    await user.type(screen.getByLabelText('Code editor'), '#')
    expect(await screen.findByText(/code has changed since this table was generated/i)).toBeInTheDocument()
  })
})
