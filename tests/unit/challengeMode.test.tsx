import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { decodeShare, encodeShare, parseShareHash, type ChallengeSpec } from '../../src/core/share/urlState'
import { DEFAULT_STUDY_CONFIG, type StudyConfig } from '../../src/core/study/types'
import type { TraceResult } from '../../src/core/types'
import { defaultWorkspace, type Workspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { STORAGE_KEY } from '../../src/store/persistence'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => {
    const { code, setCode } = useStore()
    return <textarea aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
  },
}))

const CLEAN = {
  result: null,
  ranSig: null,
  ranInput: null,
  running: false,
  hoverStep: null,
  selectedStep: null,
  watchErrors: {},
  shared: null,
  sharedLinkInvalid: false,
  challenge: null,
  studyOnRun: null,
  study: null,
  studySessions: {},
  studyOrder: [],
}

const SPEC: ChallengeSpec = { steps: traces.digitSum.steps.length, executionKey: traces.digitSum.executionKey }
const MINE = 'mine = 1\n'
const THEIRS = 'total = 0  # the challenge\n'

const columnsOnly: StudyConfig = { ...DEFAULT_STUDY_CONFIG, maskMode: 'columns', columns: ['<module>:total'] }

function challengeHash(patch: Partial<Workspace> = {}, spec: ChallengeSpec = SPEC) {
  return `#s=${encodeShare({ ...defaultWorkspace(THEIRS), studyConfig: columnsOnly, studySeed: 5, ...patch }, spec)}`
}

/** Records any moment the trace table had body rows but nothing to fill in. */
let leaks = 0
let watcher: MutationObserver | undefined
function watchForOpenTables() {
  leaks = 0
  watcher = new MutationObserver(() => {
    const table = document.querySelector('table[aria-label="Trace table"]')
    if (table?.querySelector('tbody tr') && !table.querySelector('input[data-study-key]')) leaks++
  })
  watcher.observe(document.body, { childList: true, subtree: true })
}

/** The visitor has their own workspace; the page opens with `hash`. */
async function open(hash: string, result: TraceResult = traces.digitSum, { watch = true } = {}) {
  const runner = new FakeTraceRunner(result)
  const runSpy = vi.spyOn(runner, 'runTrace')
  setRunnerOverride(runner)
  history.replaceState(null, '', `/${hash}`)
  useStore.setState({ ...defaultWorkspace(MINE), ...CLEAN })
  if (watch) watchForOpenTables()
  render(<App />)
  await waitFor(() => expect(runner.getStatus().state).toBe('ready'))
  return { runner, runSpy, user: userEvent.setup() }
}

const panel = () => screen.queryByRole('region', { name: 'Student challenge' })
const table = () => screen.queryByRole('table', { name: 'Trace table' })
const startButton = () => screen.getByRole('button', { name: 'Start challenge' })
const answerBoxes = () => screen.queryAllByRole('textbox', { name: /^Row \d+ \(line/ }) as HTMLInputElement[]
const challenge = () => useStore.getState().challenge
const persistedCode = () => (JSON.parse(localStorage.getItem(STORAGE_KEY)!) as { state: { code: string } }).state.code
const pressedRun = () => fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true })

async function openAndStart(hash = challengeHash(), result?: TraceResult) {
  const ctx = await open(hash, result)
  await ctx.user.click(startButton())
  await screen.findByRole('table', { name: 'Trace table' })
  return ctx
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  watcher?.disconnect()
  cleanup()
  useStore.getState().cancelScheduledRerun()
  setRunnerOverride(null)
  vi.restoreAllMocks()
})

describe('opening a student link', () => {
  it('shows the review panel with no table and runs nothing', async () => {
    const { runSpy, user } = await open(challengeHash())
    expect(panel()).toHaveTextContent('Nothing has been run')
    expect(table()).toBeNull()
    expect(screen.queryByRole('region', { name: 'Shared workspace' })).toBeNull()
    expect(screen.getByRole('button', { name: /^Run$/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^study mode/i })).toBeDisabled()
    pressedRun()
    await user.type(screen.getByLabelText('Code editor'), '{Control>}{Enter}{/Control}')
    await act(() => useStore.getState().run())
    expect(runSpy).not.toHaveBeenCalled()
    expect(persistedCode()).toBe(MINE)
  })

  it('Start challenge runs once and the first table on screen is already masked', async () => {
    const { runSpy } = await openAndStart()
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(runSpy.mock.calls[0]![0]).toBe(THEIRS)
    expect(answerBoxes()).toHaveLength(5)
    expect(answerBoxes().every((b) => b.dataset.studyCol === '<module>:total')).toBe(true)
    expect(challenge()).toMatchObject({ stage: 'active', checkedOnce: false, hidNothing: false })
    expect(leaks).toBe(0)
  })

  it('a broken spec opens as a plain shared workspace with a note, and still does not run', async () => {
    const { runSpy } = await open(challengeHash({}, { steps: 0, executionKey: 'x' }))
    expect(panel()).toBeNull()
    expect(screen.getByRole('region', { name: 'Shared workspace' })).toHaveTextContent(/meant to be a student challenge/)
    expect(runSpy).not.toHaveBeenCalled()
    expect(challenge()).toBeNull()
  })

  it('an unreadable link shows the invalid-link alert and changes nothing', async () => {
    await open(challengeHash().slice(0, 30), traces.digitSum, { watch: false })
    expect(screen.getByText(/That share link couldn’t be read/)).toBeInTheDocument()
    expect(challenge()).toBeNull()
    expect(useStore.getState().code).toBe(MINE)
  })

  it('a second link keeps the FIRST backup, and arrives by hashchange', async () => {
    await openAndStart()
    history.replaceState(null, '', `/${challengeHash({ code: 'second = 2\n' })}`)
    await act(async () => void window.dispatchEvent(new HashChangeEvent('hashchange')))
    expect(challenge()?.stage).toBe('review')
    expect(table()).toBeNull()
    expect(useStore.getState()).toMatchObject({ code: 'second = 2\n', study: null })
    expect(useStore.getState().shared?.backup.code).toBe(MINE)
    expect(persistedCode()).toBe(MINE)
  })

  it('stays on the review panel if the run is cancelled', async () => {
    const { runner, user } = await open(challengeHash())
    runner.runTrace = () => new Promise(() => {})
    await user.click(startButton())
    expect(panel()).toHaveTextContent('Running the program…')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(challenge()?.stage).toBe('review')
    expect(useStore.getState().studyOnRun).toBeNull()
    expect(startButton()).toBeEnabled()
  })

  it('End challenge during the run drops it: its result never lands on the restored workspace', async () => {
    const { runner, user } = await open(challengeHash(), traces.digitSum, { watch: false })
    let finish!: (r: TraceResult) => void
    runner.runTrace = () => new Promise((resolve) => (finish = resolve))
    await user.click(startButton())
    runner.runTrace = () => new Promise(() => {})
    await user.click(screen.getByRole('button', { name: 'End challenge' }))
    await act(async () => finish(traces.digitSum))
    expect(useStore.getState()).toMatchObject({ code: MINE, challenge: null, result: null, study: null, shared: null })
  })
})

describe('while the challenge is on', () => {
  it('has no mask controls, no exit, no Reveal before the first check, and no exports', async () => {
    const { user } = await openAndStart()
    const toolbar = screen.getByRole('region', { name: 'Study mode' })
    expect(within(toolbar).queryByRole('radio')).toBeNull()
    expect(within(toolbar).queryByRole('checkbox')).toBeNull()
    expect(within(toolbar).queryByRole('button', { name: /random mask|exit study mode/i })).toBeNull()
    expect(within(toolbar).getByText(/Reveal unlocks after Check answers/)).toBeInTheDocument()
    expect(screen.queryAllByRole('button', { name: /^Reveal / })).toHaveLength(0)
    expect(screen.queryByRole('button', { name: /^(Blank this|Show):/ })).toBeNull()
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /^study mode/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: /copy student challenge link/i })).toBeDisabled()

    // Alt+R does nothing yet, from the keyboard or the store
    await user.click(answerBoxes()[0]!)
    await user.keyboard('{Alt>}r{/Alt}')
    expect(answerBoxes()[0]).not.toHaveAttribute('aria-keyshortcuts', expect.stringContaining('Alt+R'))
    act(() => useStore.getState().revealCell(answerBoxes()[0]!.dataset.studyKey!))
    expect(screen.queryByTestId('revealed-cell')).toBeNull()
  })

  it('the store refuses every way out of the mask', async () => {
    await openAndStart()
    const before = useStore.getState().study
    act(() => {
      const s = useStore.getState()
      s.exitStudy()
      s.setStudyConfig({ maskMode: 'random', percent: 1 })
      s.reshuffleStudy()
      s.toggleCellMask(answerBoxes()[0]!.dataset.studyKey!)
      s.keepShared()
      s.startStudy()
    })
    expect(useStore.getState().study).toBe(before)
    expect(challenge()?.stage).toBe('active')
    expect(answerBoxes()).toHaveLength(5)
    expect(leaks).toBe(0)
  })

  it('Reveal appears after Check answers; Why? works throughout', async () => {
    const { user } = await openAndStart()
    await user.type(answerBoxes()[0]!, '999')
    await user.click(screen.getByRole('button', { name: 'Check answers' }))
    expect(screen.getAllByRole('button', { name: /^Reveal / })).toHaveLength(5)
    expect(screen.getAllByRole('button', { name: /^Why\?/ }).length).toBeGreaterThan(0)
    await user.click(answerBoxes()[0]!)
    await user.keyboard('{Alt>}r{/Alt}')
    expect(screen.getByTestId('revealed-cell')).toBeInTheDocument()
  })

  it('printing renders a notice, not the table', async () => {
    await openAndStart()
    act(() => void window.dispatchEvent(new Event('beforeprint')))
    const region = screen.getByTestId('print-region')
    expect(region).toHaveTextContent('Printing is off during a challenge.')
    expect(region.querySelector('table')).toBeNull()
  })

  it('editing the code shows the stale banner, nothing can re-run it, and the banner ends the challenge', async () => {
    const { runSpy, user } = await openAndStart()
    await user.type(screen.getByLabelText('Code editor'), '# edit')
    expect(screen.getByRole('alert')).toHaveTextContent('since this challenge began')
    pressedRun()
    act(() => void useStore.getState().addWatch('total'))
    await act(() => useStore.getState().run())
    expect(runSpy).toHaveBeenCalledTimes(1)
    expect(answerBoxes()).toHaveLength(5)
    expect(leaks).toBe(0)
    watcher!.disconnect()
    await user.click(screen.getByRole('button', { name: 'End the challenge' }))
    expect(useStore.getState().code).toBe(MINE)
  })

  it('End challenge restores the visitor’s own workspace and runs it', async () => {
    const { runSpy, user } = await openAndStart()
    watcher!.disconnect() // their own table is meant to be open
    await user.click(screen.getByRole('button', { name: 'End challenge' }))
    await waitFor(() => expect(table()).not.toBeNull())
    expect(runSpy.mock.calls.at(-1)![0]).toBe(MINE)
    expect(useStore.getState()).toMatchObject({ code: MINE, challenge: null, shared: null, study: null })
    expect(useStore.getState().studyConfig).toEqual(DEFAULT_STUDY_CONFIG)
    expect(location.hash).toBe('')
  })

  it('loading an example leaves the challenge', async () => {
    await openAndStart()
    watcher!.disconnect()
    await act(async () => useStore.getState().loadPreset('factorial'))
    expect(challenge()).toBeNull()
    expect(panel()).toBeNull()
  })

  it('a reload goes back to review, then resumes the saved answers', async () => {
    const hash = challengeHash()
    const first = await openAndStart(hash)
    await first.user.type(answerBoxes()[0]!, '0')
    const saved = localStorage.getItem(STORAGE_KEY)!
    watcher!.disconnect()
    cleanup()

    const second = await open(hash)
    localStorage.setItem(STORAGE_KEY, saved)
    history.replaceState(null, '', `/${hash}`)
    await act(async () => {
      await useStore.persist.rehydrate()
      useStore.getState().openSharedFromHash()
    })
    expect(table()).toBeNull()
    await second.user.click(startButton())
    await screen.findByRole('table', { name: 'Trace table' })
    expect(answerBoxes()[0]).toHaveValue('0')
    expect(screen.getByText(/saved answers for this exact program were restored/)).toBeInTheDocument()
    expect(challenge()?.checkedOnce).toBe(false)
    expect(leaks).toBe(0)
  })

  it('answers saved under a different mask are not brought into the challenge', async () => {
    useStore.setState({ ...CLEAN })
    const runner = new FakeTraceRunner(traces.digitSum)
    setRunnerOverride(runner)
    history.replaceState(null, '', `/${challengeHash()}`)
    useStore.setState({
      ...defaultWorkspace(MINE),
      studySessions: {
        [SPEC.executionKey]: { config: DEFAULT_STUDY_CONFIG, seed: 5, answers: {}, revealed: ['1:<module>:total'] },
      },
      studyOrder: [SPEC.executionKey],
    })
    render(<App />)
    await waitFor(() => expect(startButton()).toBeEnabled())
    await userEvent.setup().click(startButton())
    await screen.findByRole('table', { name: 'Trace table' })
    expect(screen.queryByTestId('revealed-cell')).toBeNull()
  })

  it.each<[string, Partial<StudyConfig>]>([
    ['unknown columns', { maskMode: 'columns', columns: ['<module>:gone'] }],
    ['forged cell keys', { maskMode: 'cells', cells: ['999:<module>:total'] }],
    ['zero per cent', { maskMode: 'random', percent: 0 }],
  ])('a mask that hides nothing (%s) hides everything instead, and says so', async (_name, patch) => {
    await openAndStart(challengeHash({ studyConfig: { ...DEFAULT_STUDY_CONFIG, ...patch } }))
    expect(screen.getByText(/This challenge hides nothing/)).toBeInTheDocument()
    expect(answerBoxes()).toHaveLength(15)
    expect(useStore.getState().study!.config.maskMode).toBe('all')
    expect(leaks).toBe(0)
  })
})

describe('a table that does not match the link', () => {
  it.each<[string, TraceResult, ChallengeSpec]>([
    ['a different step count', traces.digitSum, { ...SPEC, steps: SPEC.steps + 1 }],
    ['a different execution key', traces.digitSum, { ...SPEC, executionKey: 'other' }],
    ['a run that did not finish', traces.zeroDivision, { steps: traces.zeroDivision.steps.length, executionKey: traces.zeroDivision.executionKey }],
    ['a run with no table', traces.syntaxError, SPEC],
  ])('%s is reported, with no table on screen', async (_name, result, spec) => {
    const { user } = await open(challengeHash({}, spec), result)
    await user.click(startButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('didn’t produce the same table')
    expect(table()).toBeNull()
    expect(challenge()?.stage).toBe('unreproducible')
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
    expect(leaks).toBe(0)
  })

  it('"Show the table anyway" goes straight into ordinary study mode', async () => {
    const { user } = await open(challengeHash({}, { ...SPEC, steps: 3 }))
    await user.click(startButton())
    await user.click(await screen.findByRole('button', { name: 'Show the table anyway' }))
    expect(answerBoxes()).toHaveLength(5)
    expect(challenge()).toBeNull()
    expect(screen.getByRole('button', { name: /exit study mode/i })).toBeInTheDocument()
    expect(leaks).toBe(0)
  })
})

describe('authoring: hand-picked cells and the link button', () => {
  async function teacher(workspace: Partial<Workspace> = {}) {
    const runner = new FakeTraceRunner(traces.digitSum)
    setRunnerOverride(runner)
    history.replaceState(null, '', '/')
    useStore.setState({ ...defaultWorkspace(MINE), ...workspace, ...CLEAN })
    render(<App />)
    await screen.findByRole('table')
    const user = userEvent.setup()
    const clipboard = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } })
    return { user, clipboard }
  }
  const toggles = (name: RegExp) => screen.queryAllByRole('button', { name })
  const decodeCopied = (url: string) => decodeShare(parseShareHash(new URL(url).hash)!)!

  it('"Chosen cells" starts with nothing hidden; Blank this and Show are pressed-state toggles', async () => {
    const { user } = await teacher()
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    await user.click(screen.getByRole('radio', { name: 'Chosen cells' }))
    expect(answerBoxes()).toHaveLength(0)
    expect(toggles(/^Blank this:/)).toHaveLength(15)
    const first = toggles(/^Blank this:/)[0]!
    expect(first).toHaveAttribute('aria-pressed', 'false')
    await user.click(first)
    expect(answerBoxes()).toHaveLength(1)
    const show = screen.getByRole('button', { name: /^Show: Row 1 / })
    expect(show).toHaveAttribute('aria-pressed', 'true')
    expect(useStore.getState().studyConfig.cells).toEqual([answerBoxes()[0]!.dataset.studyKey])
    await user.click(show)
    expect(answerBoxes()).toHaveLength(0)
  })

  it('picking a cell drops keys left over from another program', async () => {
    const { user } = await teacher({ studyConfig: { ...DEFAULT_STUDY_CONFIG, maskMode: 'cells', cells: ['999:<module>:old'] } })
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    await user.click(toggles(/^Blank this:/)[0]!)
    expect(useStore.getState().study!.config.cells).toHaveLength(1)
  })

  it('copies a link carrying the running session’s mask and a fixed seed', async () => {
    const { user, clipboard } = await teacher({ studyConfig: { ...DEFAULT_STUDY_CONFIG, maskMode: 'random', percent: 40 }, studySeed: 0 })
    await user.click(screen.getByRole('button', { name: /copy student challenge link/i }))
    const dialog = screen.getByRole('dialog', { name: 'Student challenge link' })
    expect(await within(dialog).findByText('Challenge link copied to the clipboard.')).toBeInTheDocument()
    expect(dialog).toHaveTextContent('Students fill in 6 of 15 cells.')
    const first = decodeCopied(clipboard.mock.calls[0]![0])
    expect(first).toMatchObject({ mode: 'quiz', challenge: SPEC })
    expect(first.workspace.studySeed).toBeGreaterThan(0)
    expect(useStore.getState().studySeed).toBe(first.workspace.studySeed) // copying again gives the same mask

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    await user.click(screen.getByRole('radio', { name: 'Some columns' }))
    await user.click(screen.getByRole('checkbox', { name: 'total' }))
    await user.click(screen.getByRole('button', { name: /copy student challenge link/i }))
    expect(screen.getByRole('dialog', { name: 'Student challenge link' })).toHaveTextContent('Students fill in 5 of 15 cells.')
    expect(decodeCopied(clipboard.mock.calls.at(-1)![0]).workspace.studyConfig).toMatchObject({
      maskMode: 'columns',
      columns: ['<module>:total'],
    })
  })

  it('warns when the settings would hide nothing', async () => {
    const { user } = await teacher({ studyConfig: { ...DEFAULT_STUDY_CONFIG, maskMode: 'cells' } })
    await user.click(screen.getByRole('button', { name: /copy student challenge link/i }))
    expect(screen.getByRole('dialog')).toHaveTextContent('students would be asked for all 15 cells')
  })

  it('is off while the table is out of date', async () => {
    const { user } = await teacher()
    await user.type(screen.getByLabelText('Code editor'), '#')
    const button = screen.getByRole('button', { name: /copy student challenge link/i })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'Run the current program first')
    expect(useStore.getState().challengeLink()).toBeNull()
  })
})
