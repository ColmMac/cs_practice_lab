import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/App'
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
  return render(<App />)
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
    render(<App />)
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
