import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from '../../src/app/HomePage'
import { TraceTableRoute } from '../../src/app/TraceTableRoute'
import { MASTERY_KEY, type MasteryFile } from '../../src/core/mastery/types'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { DEFAULT_STUDY_CONFIG } from '../../src/core/study/types'
import { defaultWorkspace } from '../../src/core/workspace'
import { pythonPresets } from '../../src/languages/python/presets'
import { useStore } from '../../src/store'
import { saveAttempt } from '../../src/store/masteryStorage'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => <textarea aria-label="Code editor" readOnly />,
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

const stored = () => JSON.parse(localStorage.getItem(MASTERY_KEY) ?? 'null') as MasteryFile | null
const preset = (id: string) => pythonPresets.find((p) => p.id === id)!

/** The digit-sum table asks 13 answers; this is what each cell of the fixture really holds. */
const truthOf = (key: string): string => {
  const [step, ...rest] = key.split(':')
  const col = rest.join(':')
  const s = traces.digitSum.steps[Number(step)]!
  if (col === 'output') return '10'
  const name = col.split(':')[1]!
  const value = s.scopes.at(-1)!.vars[name]!
  return String((value as { v: unknown }).v)
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  useStore.setState({ ...defaultWorkspace('mine = 1\n'), ...CLEAN })
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun()
  setRunnerOverride(null)
  vi.restoreAllMocks()
})

describe('the home page', () => {
  const home = () =>
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>,
    )
  const cta = () => screen.getByRole('link', { name: /^(Practice next|Revisit)/ })
  const attempt = (itemId: string, percent: number) => ({ tool: 'trace' as const, itemId, percent, newSession: true })

  it('starts at 0 of 6, offers the first preset, and has nothing to reset', () => {
    home()
    expect(screen.getByText('0/6 trace presets mastered')).toBeInTheDocument()
    expect(cta()).toHaveTextContent('Practice next: Linear search')
    expect(cta()).toHaveAttribute('href', '/trace-table?preset=linear-search&study=1')
    expect(screen.queryByRole('button', { name: /reset my progress/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/6 mastered$/)).not.toBeInTheDocument()
  })

  it('updates as progress is saved, with a badge on the trace card', () => {
    home()
    act(() => saveAttempt(attempt('linear-search', 100)))
    expect(screen.getByText('1/6 trace presets mastered')).toBeInTheDocument()
    expect(cta()).toHaveTextContent('Practice next: Bubble sort')
    const card = screen.getByRole('heading', { name: 'Trace tables' }).closest('section')!
    expect(within(card).getByText('1/6 mastered')).toBeInTheDocument()
  })

  it('offers a revisit once everything is mastered', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    for (const [i, p] of pythonPresets.entries()) {
      vi.setSystemTime(1_800_000_000_000 + (p.id === 'digit-sum' ? 0 : 1000 + i))
      saveAttempt(attempt(p.id, 100))
    }
    home()
    expect(screen.getByText('6/6 trace presets mastered')).toBeInTheDocument()
    expect(cta()).toHaveTextContent('Revisit Digit sum')
    vi.useRealTimers()
  })

  it('"Reset my progress" asks first', async () => {
    saveAttempt(attempt('linear-search', 100))
    home()
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await user.click(screen.getByRole('button', { name: /reset my progress/i }))
    expect(screen.getByText('1/6 trace presets mastered')).toBeInTheDocument()
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: /reset my progress/i }))
    expect(screen.getByText('0/6 trace presets mastered')).toBeInTheDocument()
    expect(stored()).toBeNull()
  })

  it('ignores a corrupt saved value', () => {
    localStorage.setItem(MASTERY_KEY, '{"v":1,"records":{"trace:linear-search":{"bestPercent":"all"}}}')
    home()
    expect(screen.getByText('0/6 trace presets mastered')).toBeInTheDocument()
  })
})

describe('practice links and what counts', () => {
  let search = ''
  function Where() {
    search = useLocation().search
    return null
  }

  function open(url: string) {
    const runner = new FakeTraceRunner(traces.digitSum)
    setRunnerOverride(runner)
    const view = render(
      <MemoryRouter initialEntries={[url]}>
        <TraceTableRoute />
        <Where />
      </MemoryRouter>,
    )
    return { runner, ...view }
  }

  const boxes = () => screen.queryAllByRole('textbox', { name: /^Row \d+ \(line/ }) as HTMLInputElement[]
  const answerAll = (upTo = Number.POSITIVE_INFINITY) =>
    act(() => {
      boxes()
        .slice(0, upTo)
        .forEach((b) => useStore.getState().setAnswer(b.dataset.studyKey!, truthOf(b.dataset.studyKey!)))
    })
  const check = () => act(() => void useStore.getState().checkAnswers())
  const record = () => stored()?.records['trace:digit-sum']

  /** Counts any moment the trace table has rows but nothing to fill in. */
  function watchForOpenTables() {
    const seen = { count: 0 }
    const observer = new MutationObserver(() => {
      const table = document.querySelector('table[aria-label="Trace table"]')
      if (table?.querySelector('tbody tr') && !table.querySelector('input[data-study-key]')) seen.count++
    })
    observer.observe(document.body, { childList: true, subtree: true })
    return { seen, observer }
  }

  it('?study=1 opens the preset as a session with every cell hidden, and drops the parameters', async () => {
    // a left-over mask that would hide almost nothing
    useStore.setState({ studyConfig: { ...DEFAULT_STUDY_CONFIG, maskMode: 'columns', columns: [], closeCredit: 0 } })
    open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    expect(useStore.getState().code).toBe(preset('digit-sum').code)
    expect(useStore.getState().study!.config).toMatchObject({ maskMode: 'all', outputOnly: false, closeCredit: 0 })
    expect(useStore.getState().studyOnRun).toBeNull()
    expect(search).toBe('')
  })

  it('never shows the table left over from an earlier visit, even when it is the same program', async () => {
    const first = open('/trace-table?preset=digit-sum')
    await screen.findByRole('table')
    expect(boxes()).toHaveLength(0)
    first.unmount()

    const { seen, observer } = watchForOpenTables()
    open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    observer.disconnect()
    expect(seen.count).toBe(0)
  })

  it('keeps answers already typed for the same program', async () => {
    const first = open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    answerAll(2)
    first.unmount()
    open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    expect(boxes().filter((b) => b.value !== '')).toHaveLength(2)
  })

  it.each(['/trace-table?study=1', '/trace-table?preset=nope&study=1'])('%s starts no study session', async (url) => {
    useStore.setState({ ...defaultWorkspace(preset('digit-sum').code) })
    open(url)
    await screen.findByRole('table')
    expect(useStore.getState().study).toBeNull()
    expect(search).toBe('')
  })

  it('a waiting request is dropped if the program is edited, and survives a runtime failure', async () => {
    const failing = new FakeTraceRunner(traces.digitSum)
    failing.runTrace = () => Promise.reject(new Error('no python'))
    setRunnerOverride(failing)
    await act(async () => useStore.getState().loadPreset('digit-sum', { study: true }))
    expect(useStore.getState().studyOnRun).not.toBeNull()

    // "Try again" works: the table arrives masked
    setRunnerOverride(new FakeTraceRunner(traces.digitSum))
    await act(() => useStore.getState().run())
    expect(useStore.getState().study).not.toBeNull()

    setRunnerOverride(failing)
    await act(async () => useStore.getState().loadPreset('digit-sum', { study: true }))
    act(() => useStore.getState().setCode('x = 1\n'))
    expect(useStore.getState().studyOnRun).toBeNull()
  })

  it('a right answer to the whole table masters the preset; checking twice is one attempt', async () => {
    open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    answerAll()
    check()
    expect(record()).toMatchObject({ attempts: 1, bestPercent: 100, mastered: true })
    act(() => useStore.getState().setAnswer(boxes()[0]!.dataset.studyKey!, 'wrong'))
    check()
    expect(record()).toMatchObject({ attempts: 1, bestPercent: 100, lastPercent: 92, mastered: true })
    // starting over is a new attempt
    act(() => useStore.getState().resetAnswers())
    check()
    expect(record()).toMatchObject({ attempts: 2, bestPercent: 100, lastPercent: 0 })
  })

  it('does not count a session where more than half the table was revealed', async () => {
    open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    const keys = boxes().map((b) => b.dataset.studyKey!)
    act(() => keys.slice(0, 7).forEach((k) => useStore.getState().revealCell(k))) // 6 of 13 left
    answerAll()
    check()
    expect(stored()).toBeNull()
  })

  it('does not count a mask that asks for less than half the table', async () => {
    open('/trace-table?preset=digit-sum&study=1')
    await waitFor(() => expect(boxes()).toHaveLength(13))
    act(() => useStore.getState().setStudyConfig({ outputOnly: true }))
    answerAll()
    check()
    expect(stored()).toBeNull()
  })

  it('does not count an edited preset', async () => {
    setRunnerOverride(new FakeTraceRunner(traces.digitSum))
    useStore.setState({ ...defaultWorkspace(`${preset('digit-sum').code}\n# edited\n`) })
    await act(() => useStore.getState().run())
    act(() => useStore.getState().startStudy())
    check()
    expect(useStore.getState().study!.graded).not.toBeNull()
    expect(stored()).toBeNull()
  })
})
