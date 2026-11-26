import { useEffect, useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, useLocation, useNavigate } from 'react-router'
import { TOOL_RESETS } from '../../src/app/toolResets'
import { RunButton } from '../../src/components/layout/RunButton'
import { resetRunPress } from '../../src/components/layout/runPress'
import { ChunkLoadError, loadChunk } from '../../src/components/ui/chunkError'
import { ToolErrorBoundary, type ToolReset } from '../../src/components/ui/ToolErrorBoundary'
import { LAST_KEY } from '../../src/components/truth/useTruthPage'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { MASTERY_KEY } from '../../src/core/mastery/types'
import { encodeShare } from '../../src/core/share/urlState'
import { defaultWorkspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { STORAGE_KEY } from '../../src/store/persistence'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

const OTHER_KEYS = [MASTERY_KEY, 'tts:theme', 'tts:projector', 'tts:welcomed', 'tts:pseudo-dialect']

let broken: unknown = null
/** Throws while `broken` is set. Also shows the address it was mounted with. */
function Child() {
  const [mountedAt] = useState(useLocation().search)
  if (broken) throw broken
  return <p>tool works{mountedAt}</p>
}

function mount(props: Partial<ToolReset> & { reload?: () => void } = {}, url = '/truth-tables') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <ToolErrorBoundary toolName="Truth tables" storageKeys={['mine:a', 'mine:b']} {...props}>
        <Child />
      </ToolErrorBoundary>
    </MemoryRouter>,
  )
}

const reset = () => userEvent.setup().click(screen.getByRole('button', { name: 'Reset Tool' }))

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  broken = new Error('boom')
  resetRunPress()
  // React and the boundary both log a caught error
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun()
  setRunnerOverride(null)
  vi.restoreAllMocks()
})

describe('ToolErrorBoundary', () => {
  it('shows an alert panel, focuses its heading and logs the error', () => {
    mount()
    expect(screen.getByRole('alert')).toHaveTextContent('Truth tables stopped working')
    expect(screen.getByRole('heading', { level: 1, name: 'Truth tables stopped working' })).toHaveFocus()
    expect(screen.getByRole('main')).toHaveClass('min-h-dvh')
    expect(screen.getByRole('button', { name: 'Reset Tool' }).querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(console.error).toHaveBeenCalledWith('Truth tables crashed:', broken, expect.any(String))
  })

  it('Reset Tool removes exactly its own keys and mounts the child again, without the query', async () => {
    for (const k of ['mine:a', 'mine:b', ...OTHER_KEYS]) localStorage.setItem(k, 'x')
    mount({}, '/truth-tables?expr=bad#frag')
    broken = null
    await reset()
    expect(await screen.findByText('tool works')).toBeInTheDocument() // no ?expr= left for it to read
    expect(screen.queryByRole('alert')).toBeNull()
    expect(localStorage.getItem('mine:a')).toBeNull()
    expect(localStorage.getItem('mine:b')).toBeNull()
    for (const k of OTHER_KEYS) expect(localStorage.getItem(k)).toBe('x')
  })

  it('shows the panel again if the tool still crashes', async () => {
    mount()
    await reset()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reset Tool' })).toBeEnabled())
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('keeps the keys when resetState says it restored the user’s own state', async () => {
    localStorage.setItem('mine:a', 'x')
    const resetState = vi.fn(() => 'restored' as const)
    mount({ resetState })
    broken = null
    await reset()
    await screen.findByText('tool works')
    expect(resetState).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('mine:a')).toBe('x')
  })

  it('reloads the page, touching nothing, when the page’s chunk failed to load', async () => {
    broken = await loadChunk(() => Promise.reject(new Error('404'))).catch((e: unknown) => e)
    expect(broken).toBeInstanceOf(ChunkLoadError)
    localStorage.setItem('mine:a', 'x')
    const reload = vi.fn()
    const resetState = vi.fn()
    mount({ reload, resetState })
    expect(screen.getByRole('alert')).toHaveTextContent('This page did not load')
    await reset()
    expect(reload).toHaveBeenCalledTimes(1)
    expect(resetState).not.toHaveBeenCalled()
    expect(localStorage.getItem('mine:a')).toBe('x')
  })

  it('does not carry one tool’s panel over to the next', async () => {
    const nav = {} as { go(to: string): void }
    function Routed() {
      const navigate = useNavigate()
      useEffect(() => {
        nav.go = (to) => void navigate(to)
      })
      const path = useLocation().pathname
      return (
        <ToolErrorBoundary toolName={path} storageKeys={[]}>
          <Child />
        </ToolErrorBoundary>
      )
    }
    render(
      <MemoryRouter initialEntries={['/a']}>
        <Routed />
      </MemoryRouter>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('/a stopped working')
    broken = null
    act(() => nav.go('/b'))
    expect(await screen.findByText('tool works')).toBeInTheDocument()
  })

  it('clears the keys the tools really use', () => {
    expect(TOOL_RESETS.traceTable.storageKeys).toEqual([STORAGE_KEY])
    expect(TOOL_RESETS.truthTables.storageKeys).toEqual([LAST_KEY])
    expect(TOOL_RESETS.numberSystems.storageKeys).toEqual([])
    expect(TOOL_RESETS.sorting.storageKeys).toEqual([])
  })
})

describe('resetting the trace tool', () => {
  const resetTrace = () =>
    mount({ toolName: 'Trace tables', storageKeys: TOOL_RESETS.traceTable.storageKeys, resetState: TOOL_RESETS.traceTable.resetState })
  const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { state: { code: string } } | null

  beforeEach(() => {
    setRunnerOverride(new FakeTraceRunner(traces.digitSum))
    useStore.setState({ ...useStore.getInitialState(), runnerStatus: { state: 'uninitialised' } }, true)
  })

  it('clears the stored workspace and the one in memory, and leaves mastery alone', async () => {
    useStore.getState().setCode('mine = 1\n')
    localStorage.setItem(MASTERY_KEY, 'keep')
    expect(stored()?.state.code).toBe('mine = 1\n')
    resetTrace()
    broken = null
    await reset()
    await screen.findByText('tool works')
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(useStore.getState().code).toBe(useStore.getInitialState().code)
    expect(localStorage.getItem(MASTERY_KEY)).toBe('keep')
  })

  it('during a shared review, brings back the visitor’s own workspace and keeps it stored', async () => {
    useStore.getState().setCode('mine = 1\n')
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('theirs = 2\n'))}`)
    useStore.getState().openSharedFromHash()
    expect(useStore.getState().code).toBe('theirs = 2\n')
    resetTrace()
    broken = null
    await reset()
    await screen.findByText('tool works')
    expect(useStore.getState().shared).toBeNull()
    expect(useStore.getState().code).toBe('mine = 1\n')
    expect(stored()?.state.code).toBe('mine = 1\n')
    expect(location.hash).toBe('')
  })
})

describe('the Run button', () => {
  const button = () => screen.getByRole('button')

  it.each([
    [{ state: 'uninitialised' as const }, 'Loading Python…'],
    [{ state: 'loading' as const, message: 'Downloading…' }, 'Loading Python…'],
    [{ state: 'failed' as const, message: 'offline' }, 'Python unavailable'],
  ])('is disabled and says why while Python is %o', (runnerStatus, name) => {
    useStore.setState({ running: false, challenge: null, runnerStatus })
    render(<RunButton />)
    expect(button()).toHaveAccessibleName(name)
    expect(button()).toBeDisabled()
    expect(button()).toHaveAttribute('title', expect.stringContaining('Python'))
  })

  it('says Run when Python is ready and Cancel while a program runs, holding every label so its width is fixed', () => {
    useStore.setState({ running: false, challenge: null, runnerStatus: { state: 'ready' } })
    render(<RunButton />)
    expect(button()).toHaveAccessibleName('Run')
    expect(button()).toBeEnabled()
    for (const label of ['Run', 'Loading Python…', 'Python unavailable', 'Cancel']) expect(button()).toHaveTextContent(label)
    act(() => useStore.setState({ running: true, runnerStatus: { state: 'running', stepsExecuted: 0 } }))
    expect(button()).toHaveAccessibleName('Cancel')
    expect(button()).toBeEnabled()
  })
})
