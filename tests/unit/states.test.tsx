import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../src/App'
import { encodeShare } from '../../src/core/share/urlState'
import type { RunnerStatus, TraceRunner } from '../../src/core/runner'
import { defaultWorkspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => {
    const { code, setCode } = useStore()
    return <textarea aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
  },
}))

const CLEAN = {
  result: null, ranSig: null, ranInput: null, running: false, hoverStep: null, selectedStep: null, watchErrors: {},
  shared: null, sharedLinkInvalid: false, study: null, studySessions: {}, studyOrder: [], welcomed: false,
  runnerStatus: { state: 'uninitialised' } as RunnerStatus,
}

/** A runner whose loading we control. `init` is a script: each call does the next thing. */
function controllableRunner(initScript: Array<(set: (s: RunnerStatus) => void) => Promise<void> | void>) {
  let status: RunnerStatus = { state: 'uninitialised' }
  const listeners = new Set<(s: RunnerStatus) => void>()
  const set = (s: RunnerStatus) => {
    status = s
    listeners.forEach((l) => l(s))
  }
  let call = 0
  const runner: TraceRunner = {
    language: 'python',
    capabilities: { watchExpressions: false, stdin: true, inputMode: 'rerun', hardInterrupt: false, branchInfo: false, returnValues: true },
    getStatus: () => status,
    onStatus: (l) => (listeners.add(l), () => void listeners.delete(l)),
    init: vi.fn(async () => {
      const step = initScript[Math.min(call++, initScript.length - 1)]!
      await step(set)
    }),
    runTrace: vi.fn(async () => traces.digitSum),
    cancel: () => {},
    dispose: () => {},
  }
  return { runner, set }
}

function mount(runner: TraceRunner, extra: Record<string, unknown> = {}) {
  setRunnerOverride(runner)
  useStore.setState({ ...defaultWorkspace('n = 1234\n'), ...CLEAN, ...extra })
  render(<App />, { wrapper: MemoryRouter })
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

describe('while Python is loading', () => {
  it('says so (with the size and the progress message), instead of "Press Run"', async () => {
    const { runner } = controllableRunner([(set) => (set({ state: 'loading', message: 'Downloading Python runtime…' }), new Promise(() => {}))])
    mount(runner)
    const panel = await screen.findByText('Getting Python ready…')
    expect(panel.closest('[role=status]')).toHaveTextContent('Downloading Python runtime…')
    expect(panel.closest('[role=status]')).toHaveTextContent('about 10 MB')
    expect(screen.queryByText(/Press Run/)).not.toBeInTheDocument()
  })

  it('shows the table the moment it is ready, with nothing left to do', async () => {
    const { runner, set } = controllableRunner([async (s) => (s({ state: 'loading', message: 'Starting…' }), s({ state: 'ready' }))])
    mount(runner)
    set({ state: 'ready' })
    expect(await screen.findByRole('table', { name: 'Trace table' })).toBeInTheDocument()
    expect(screen.queryByText('Getting Python ready…')).not.toBeInTheDocument()
  })
})

describe('when Python fails to load', () => {
  const failThenSucceed = () =>
    controllableRunner([
      (set) => {
        set({ state: 'failed', message: 'Failed to fetch' })
        throw new Error('Failed to fetch')
      },
      (set) => set({ state: 'ready' }),
    ])

  it('explains what happened, keeps the user’s code safe, and offers to try again', async () => {
    const { runner } = failThenSucceed()
    mount(runner)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Python couldn’t be loaded')
    expect(alert).toHaveTextContent('internet connection')
    expect(alert).toHaveTextContent('cdn.jsdelivr.net')
    expect(alert).toHaveTextContent('Failed to fetch')
    expect(within(alert).getByRole('button', { name: 'Try again' })).toBeEnabled()
    expect(screen.getByLabelText('Code editor')).toHaveValue('n = 1234\n')
  })

  it('"Try again" restarts Python and then runs the program by itself', async () => {
    const { runner } = failThenSucceed()
    mount(runner)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('table', { name: 'Trace table' })).toBeInTheDocument()
    expect(runner.init).toHaveBeenCalledTimes(2)
    expect(runner.runTrace).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Python couldn’t be loaded')).not.toBeInTheDocument()
  })

  it('the status badge has a Retry too', async () => {
    const { runner } = failThenSucceed()
    mount(runner)
    const user = userEvent.setup()
    const badge = await screen.findByText(/Python failed to load/)
    await user.click(within(badge.closest('[role=status]') as HTMLElement).getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('table', { name: 'Trace table' })).toBeInTheDocument()
  })

  it('stays failed (and says so) if it fails again', async () => {
    const { runner } = controllableRunner([
      (set) => {
        set({ state: 'failed', message: 'offline' })
        throw new Error('offline')
      },
    ])
    mount(runner)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(runner.init).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert')).toHaveTextContent('Python couldn’t be loaded')
    expect(runner.runTrace).not.toHaveBeenCalled()
  })

  it('does not run a shared workspace behind the visitor’s back after a retry', async () => {
    const { runner } = failThenSucceed()
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('print("shared")\n'))}`)
    mount(runner)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(runner.init).toHaveBeenCalledTimes(2))
    await act(async () => { await new Promise((r) => setTimeout(r, 50)) })
    expect(runner.runTrace).not.toHaveBeenCalled()
  })
})

describe('ready but nothing run yet / running', () => {
  it('invites the user to press Run', async () => {
    const { runner } = controllableRunner([(set) => set({ state: 'ready' })])
    mount(runner, { code: '' }) // empty code: nothing auto-runs
    expect(await screen.findByText(/Press Run/)).toBeInTheDocument()
  })

  it('says Running… while a run is in progress', async () => {
    const { runner } = controllableRunner([(set) => set({ state: 'ready' })])
    runner.runTrace = () => new Promise(() => {})
    mount(runner)
    expect(await screen.findByText('Running…', { selector: 'p' })).toBeInTheDocument()
  })
})

describe('first-visit welcome', () => {
  const ready = () => controllableRunner([(set) => set({ state: 'ready' })])

  it('appears above the first table, explains the three things to try, and mentions nothing is uploaded', async () => {
    mount(ready().runner)
    const welcome = await screen.findByRole('region', { name: 'Welcome' })
    expect(welcome).toHaveTextContent('Change the code')
    expect(welcome).toHaveTextContent('Study mode')
    expect(welcome).toHaveTextContent('nothing is uploaded')
  })

  it('is not shown before there is a table', () => {
    const { runner } = controllableRunner([() => new Promise(() => {})])
    mount(runner)
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument()
  })

  it('goes away when dismissed, and is remembered', async () => {
    mount(ready().runner)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument()
    expect(localStorage.getItem('tts:welcomed')).toBe('1')
  })

  it('does not come back for someone who has dismissed it', async () => {
    mount(ready().runner, { welcomed: true })
    await screen.findByRole('table')
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument()
  })

  it('stays out of the way of a shared-link review', async () => {
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('print(1)\n'))}`)
    mount(ready().runner)
    await screen.findByRole('region', { name: 'Shared workspace' })
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument()
  })

  it('still works when storage is blocked (it just will not be remembered)', async () => {
    mount(ready().runner)
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    await user.click(await screen.findByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('region', { name: 'Welcome' })).not.toBeInTheDocument()
  })
})
