import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { readFileSync } from 'node:fs'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../src/App'
import { NumberSystemsPage } from '../../src/components/numbers/NumberSystemsPage'
import { SortingPage } from '../../src/components/sorting/SortingPage'
import { TruthTablePage } from '../../src/components/truth/TruthTablePage'
import { announce, ANNOUNCEMENT_MS, resetAnnouncements } from '../../src/components/ui/announce'
import { LiveRegion } from '../../src/components/ui/LiveRegion'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { encodeShare } from '../../src/core/share/urlState'
import type { TraceResult } from '../../src/core/types'
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

// Colour contrast needs real layout and painting, so it is audited in the real browser (see PLAN.md §15).
// document-title / html-has-lang belong to index.html, which jsdom's bare document doesn't have: checked below.
const RULES = { 'color-contrast': { enabled: false }, 'document-title': { enabled: false }, 'html-has-lang': { enabled: false }, 'html-lang-valid': { enabled: false } }

const CLEAN = {
  result: null, ranSig: null, ranInput: null, running: false, hoverStep: null, selectedStep: null, watchErrors: {},
  shared: null, sharedLinkInvalid: false, study: null, studySessions: {}, studyOrder: [], welcomed: false,
  exportOptions: { variant: 'key' as const, includeCode: false, packStudyBlanks: false },
}

function mount(result: TraceResult = traces.digitSum, workspace: Partial<ReturnType<typeof defaultWorkspace>> = {}) {
  setRunnerOverride(new FakeTraceRunner(result))
  useStore.setState({ ...defaultWorkspace('n = 1234\n'), ...workspace, ...CLEAN })
  return render(<App />, { wrapper: MemoryRouter })
}

/** Fails with a readable list of every WCAG problem axe finds on the whole page. */
async function expectAccessible(label: string) {
  const r = await axe.run(document.body, { rules: RULES, resultTypes: ['violations'] })
  const found = r.violations.map(
    (v) => `${v.id} [${v.impact}] ${v.help}\n      ${v.nodes.slice(0, 3).map((n) => n.html.slice(0, 140)).join('\n      ')}`,
  )
  expect(found, `${label}\n${found.join('\n')}`).toEqual([])
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

describe('index.html', () => {
  const html = readFileSync('index.html', 'utf8')
  it('declares the language, a title, and a responsive viewport', () => {
    expect(html).toMatch(/<html[^>]*\blang="en-GB"/)
    expect(html).toMatch(/<title>[^<]+<\/title>/)
    expect(html).toMatch(/name="viewport"[^>]*width=device-width/)
  })
})

describe('axe: no accessibility violations in any major state', () => {
  it('the first table (with the welcome note)', async () => {
    mount()
    await screen.findByRole('table')
    expect(screen.getByRole('region', { name: 'Welcome' })).toBeInTheDocument()
    await expectAccessible('first table')
  })

  it('in dark mode', async () => {
    document.documentElement.classList.add('dark')
    mount()
    await screen.findByRole('table')
    await expectAccessible('dark')
    document.documentElement.classList.remove('dark')
  })

  it('every-line mode with branch chips and carry-forward cells', async () => {
    mount(traces.digitSum, { granularity: 'every-line', displayStyle: 'carry' })
    await screen.findByRole('table')
    await expectAccessible('every line')
  })

  it('recursion with the call stack column and watches', async () => {
    mount(traces.watchesFn, {
      hiddenColumns: [],
      watches: [
        { id: 'cur', expr: 'n', scope: { kind: 'current' }, enabled: true },
        { id: 'bad', expr: 'result.pop()', scope: { kind: 'module' }, enabled: true },
      ],
    })
    await screen.findByRole('table')
    await expectAccessible('recursion + watches')
  })

  it('loading and failed runtime', async () => {
    const runner = new FakeTraceRunner(traces.digitSum)
    runner.init = () => new Promise(() => {})
    setRunnerOverride(runner)
    useStore.setState({ ...defaultWorkspace('n = 1\n'), ...CLEAN, runnerStatus: { state: 'loading', message: 'Downloading…' } })
    render(<App />, { wrapper: MemoryRouter })
    await expectAccessible('loading')
    act(() => useStore.setState({ runnerStatus: { state: 'failed', message: 'offline' } }))
    await expectAccessible('failed')
  })

  it('an error banner above a partial table', async () => {
    mount(traces.zeroDivision)
    await screen.findByRole('alert')
    await expectAccessible('runtime error')
  })

  it('a syntax error and an infinite-loop stop', async () => {
    mount(traces.syntaxError)
    await screen.findByRole('alert')
    await expectAccessible('syntax error')
    cleanup()
    mount(traces.infiniteLoop)
    await screen.findByRole('alert')
    await expectAccessible('step limit')
  })

  it('the input() prompt', async () => {
    mount(traces.needsInput)
    await screen.findByLabelText('Your answer')
    await expectAccessible('input prompt')
  })

  it('the stale-table notice', async () => {
    mount()
    await screen.findByRole('table')
    await userEvent.setup().type(screen.getByLabelText('Code editor'), '#')
    await screen.findByText(/have changed since this table/)
    await expectAccessible('stale')
  })

  it('the Column Manager popover', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /columns/i }))
    await expectAccessible('column manager')
  })

  it('the Export popover (answer key and worksheet)', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /export/i }))
    await expectAccessible('export')
    await user.click(within(screen.getByRole('dialog', { name: 'Export' })).getByRole('radio', { name: 'Worksheet' }))
    await expectAccessible('export worksheet')
  })

  it('the Share popover', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true })
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /share/i }))
    await screen.findByRole('dialog', { name: 'Share link' })
    await expectAccessible('share')
  })

  it('the watch panel with a validation error', async () => {
    mount()
    await screen.findByRole('table')
    act(() => {
      const id = useStore.getState().addWatch('arr.pop()')!
      useStore.setState({ watchErrors: { [id]: "Watch expressions can't call .pop() — it would change your program's state." } })
    })
    await expectAccessible('watch error')
  })

  it('a shared-workspace review and an unreadable link', async () => {
    history.replaceState(null, '', `/#s=${encodeShare(defaultWorkspace('print(1)\n'))}`)
    mount()
    await screen.findByRole('region', { name: 'Shared workspace' })
    await expectAccessible('shared review')
    cleanup()
    history.replaceState(null, '', '/#s=garbage')
    mount()
    await screen.findByRole('alert')
    await expectAccessible('bad link')
  })

  it('Study mode: unanswered, answered and checked (all three feedback states)', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    await expectAccessible('study: unanswered')

    const boxes = screen.getAllByRole('textbox', { name: /^Row \d+ \(line/ })
    await user.click(boxes[0]!)
    await user.paste('1234') // correct
    await user.click(boxes[1]!)
    await user.paste('0.0') // right number, wrong type → almost
    await user.click(boxes[2]!)
    await user.paste('nope') // wrong
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    await expectAccessible('study: checked')

    await user.keyboard('{Alt>}h{/Alt}')
    await user.click(screen.getByRole('button', { name: /Reveal Row 4/ }))
    await user.click(screen.getByRole('radio', { name: 'Some columns' }))
    await expectAccessible('study: hints, reveal, column picker')
  })
})

const withRouter = (page: ReactElement, url = '/') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      {page}
      <LiveRegion />
    </MemoryRouter>,
  )

const spoken = () => screen.getByTestId('live-region')
const messages = () => [...spoken().children].map((c) => c.textContent)
const expectSpoken = (text: string | RegExp) => waitFor(() => expect(spoken()).toHaveTextContent(text), { timeout: 3000 })

describe('table semantics', () => {
  it('the trace table has a caption, and each row is named by its line number', async () => {
    mount()
    const table = await screen.findByRole('table', { name: 'Trace table' })
    expect(table.querySelector('caption')).toHaveTextContent(/^Trace of the program/)
    const rows = [...table.querySelectorAll('tbody tr')]
    expect(rows.length).toBeGreaterThan(3)
    for (const row of rows) {
      expect(row.firstElementChild!.tagName).toBe('TH')
      expect(row.firstElementChild).toHaveAttribute('scope', 'row')
      expect(row.querySelectorAll('th')).toHaveLength(1)
    }
  })

  it('study answer boxes stay in plain cells, and the score table has headers of both kinds', async () => {
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    const boxes = screen.getAllByRole('textbox', { name: /^Row \d+ \(line/ })
    for (const box of boxes) expect(box.closest('td, th')!.tagName).toBe('TD')
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    await user.click(screen.getByText('By column'))
    const byColumn = screen.getByRole('table', { name: 'Score by column' })
    expect(byColumn.querySelectorAll('th[scope="col"]')).toHaveLength(4)
    expect(byColumn.querySelectorAll('tbody th[scope="row"]').length).toBeGreaterThan(1)
  })

  it('the truth table has a caption, and the first input names its row', () => {
    withRouter(<TruthTablePage />, '/truth-tables?expr=A+AND+B')
    const table = screen.getByRole('table', { name: 'Truth table' })
    expect(table.querySelector('caption')).toHaveTextContent(/^Truth table:/)
    for (const row of table.querySelectorAll('tbody tr')) {
      expect(row.querySelectorAll('th[scope="row"]')).toHaveLength(1)
      expect(row.firstElementChild!.tagName).toBe('TH')
    }
  })

  it('the history table is named by its caption, and the pass number names each row', () => {
    withRouter(<SortingPage />)
    const table = screen.getByRole('table', { name: 'Bubble sort: the array after each pass' })
    expect(table.querySelector('caption')).toHaveTextContent('Bubble sort: the array after each pass')
    const headers = [...table.querySelectorAll('tbody th[scope="row"]')].map((h) => h.textContent)
    expect(headers.slice(0, 2)).toEqual(['Start', '1'])
  })
})

describe('verdict icons', () => {
  it('Correct and Not correct have a hidden icon, Almost its ≈, and the words are unchanged', async () => {
    resetAnnouncements()
    render(<LiveRegion />)
    mount()
    const user = userEvent.setup()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    // the n column of this table reads 123, 12, 1, 0: right, "right number but a float", nonsense
    const boxes = screen.getAllByRole('textbox', { name: /^Row \d+ \(line/ }).filter((b) => b.dataset.studyCol === '<module>:n')
    for (const [i, text] of ['123', '12.0', 'oops'].entries()) {
      await user.click(boxes[i]!)
      await user.paste(text)
    }
    await user.click(screen.getByRole('button', { name: /check answers/i }))
    const verdict = (i: number) => document.getElementById(boxes[i]!.getAttribute('aria-describedby')!.split(' ')[0]!)!

    expect(verdict(0).textContent).toBe('Correct')
    expect(verdict(0).querySelector('svg.lucide-check')).toHaveAttribute('aria-hidden', 'true')
    expect(verdict(1).textContent).toMatch(/^≈ Almost — /)
    expect(within(verdict(1)).getByText('≈')).toHaveAttribute('aria-hidden', 'true')
    expect(verdict(2).textContent).toMatch(/^Not correct/)
    expect(verdict(2).querySelector('svg.lucide-x')).toHaveAttribute('aria-hidden', 'true')
    await expectSpoken(/Score: \d+(\.5)? \/ \d+ · \d+%/)
  })
})

describe('non-colour marks', () => {
  it('every sorting card says its state in its accessible name', async () => {
    withRouter(<SortingPage />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Step' }))
    const cards = within(screen.getByRole('list', { name: 'Array cards' })).getAllByRole('listitem')
    expect(cards[0]).toHaveAccessibleName('index 0, value 5, Comparing')
    expect(cards[1]).toHaveAccessibleName('index 1, value 1, Comparing')
    expect(cards[2]).toHaveAccessibleName('index 2, value 4')
  })

  it('addition marks a carry out and an overflowed sign bit with a word', async () => {
    withRouter(<NumberSystemsPage />, '/number-systems?mode=add')
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Carry out' }))
    expect(screen.getByTestId('carry-out')).toHaveTextContent(/^1Carry$/)
    expect(screen.getAllByTestId('result-bit')[0]).toHaveTextContent(/^0$/)

    await user.click(screen.getByRole('button', { name: 'Signed overflow' }))
    expect(screen.getByTestId('carry-out')).toHaveTextContent(/^0$/)
    expect(screen.getAllByTestId('result-bit')[0]).toHaveTextContent(/^1Overflow$/)

    // nothing is marked before the column has been worked
    await user.click(screen.getByRole('button', { name: 'Step through' }))
    expect(screen.queryByText('Overflow')).not.toBeInTheDocument()
  })
})

describe('announcements', () => {
  beforeEach(() => resetAnnouncements())

  it('the region is polite, not a status, and is the only polite live region written by hand', () => {
    withRouter(<SortingPage />)
    expect(spoken()).toHaveAttribute('aria-live', 'polite')
    expect(spoken()).not.toHaveAttribute('role')
    expect(spoken()).toBeEmptyDOMElement()
    expect(document.querySelectorAll('[aria-live="polite"]')).toHaveLength(1)
  })

  it('Python ready is said once after loading, not again after later runs; each run says how it ended', async () => {
    const runner = new FakeTraceRunner(traces.digitSum)
    runner.init = () => new Promise(() => {})
    setRunnerOverride(runner)
    useStore.setState({ ...defaultWorkspace('n = 1\n'), ...CLEAN, runnerStatus: { state: 'loading', message: '' } })
    withRouter(<App />)

    act(() => useStore.setState({ runnerStatus: { state: 'ready' } }))
    expect(messages()).toEqual(['Python ready'])
    act(() => useStore.setState({ runnerStatus: { state: 'running', stepsExecuted: 0 } }))
    act(() => useStore.setState({ result: traces.digitSum, runnerStatus: { state: 'ready' } }))
    const done = `Run finished: ${traces.digitSum.steps.length} steps.`
    await waitFor(() => expect(messages()).toEqual(['Python ready', done]))
    act(() => useStore.setState({ result: traces.zeroDivision }))
    await waitFor(() => expect(messages()).toEqual(['Python ready', done, 'Run failed.']))
    // the badge keeps its role but leaves the talking to the region
    const badge = screen.getAllByRole('status').find((el) => el.textContent === 'Python ready')
    expect(badge).toHaveAttribute('aria-live', 'off')
  })

  it('a rebuilt truth table is announced once typing stops, and nothing half-typed is read', async () => {
    withRouter(<TruthTablePage />, '/truth-tables?expr=A+AND+B')
    expect(spoken()).toBeEmptyDOMElement()
    const box = screen.getByLabelText('Boolean expression')
    const user = userEvent.setup()
    await user.clear(box)
    await user.type(box, 'A AND (B OR C)')
    await expectSpoken('Truth table built: 8 rows, 4 columns.')
    expect(messages()).toHaveLength(1)
  })

  it('a sorting step reads its caption, and a bad list its error', async () => {
    withRouter(<SortingPage />)
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Step' }))
    await expectSpoken('Compare 5 and 1: 5 is bigger, so swap them.')
    await user.type(screen.getByLabelText(/^List/), ', x')
    await expectSpoken(/List: /)
  })

  it('a conversion is read after typing stops, and a shift says which bit fell out', async () => {
    withRouter(<NumberSystemsPage />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/^Binary/), '1', { initialSelectionStart: 0, initialSelectionEnd: 8 })
    await expectSpoken('1 = 1')
    await user.click(screen.getByRole('button', { name: 'Logical right' }))
    await expectSpoken('Logical right shift by 1. Bit shifted out: 1.')
  })

  it('the same words are read again, and old messages leave the region', () => {
    vi.useFakeTimers()
    try {
      render(<LiveRegion />)
      act(() => {
        announce('Again')
        announce('Again')
      })
      expect(messages()).toEqual(['Again', 'Again'])
      act(() => vi.advanceTimersByTime(ANNOUNCEMENT_MS))
      expect(spoken()).toBeEmptyDOMElement()
    } finally {
      vi.useRealTimers()
    }
  })
})
