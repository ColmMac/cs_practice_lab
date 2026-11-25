import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../src/App'
import { applyColumnPrefs, deriveColumns } from '../../src/core/derive/columns'
import { deriveRows } from '../../src/core/derive/rows'
import { toMarkdown } from '../../src/core/export/markdown'
import { buildPrintPack, buildTableModel, type PackOptions } from '../../src/core/export/tableModel'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { cellKey } from '../../src/core/study/types'
import { defaultWorkspace } from '../../src/core/workspace'
import { formatPythonValue } from '../../src/languages/python/format'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => {
    const { code, setCode } = useStore()
    return <textarea aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
  },
}))

const CODE = 'n = 1234\ntotal = 0\nwhile n > 0:\n    digit = n % 10\n    total = total + digit\n    n = n // 10\nprint(total)\n'

const columns = applyColumnPrefs(deriveColumns(traces.digitSum), { hidden: ['stack'], order: [] })
const rows = deriveRows(traces.digitSum, columns, formatPythonValue)
const pack = (patch: Partial<PackOptions> = {}) =>
  buildPrintPack(columns, rows, { masked: new Set(), useStudyBlanks: false, code: CODE, codeLanguage: 'python', ...patch })

describe('buildPrintPack', () => {
  it('golden (worked by hand before the code existed): digit sum as two parts', async () => {
    const { worksheet, key } = pack()
    const text = `# ${worksheet.title}\n\n${toMarkdown(worksheet)}\n# ${key.title}\n\n${toMarkdown(key)}`
    await expect(text).toMatchFileSnapshot('../fixtures/export/digit-sum.pack.md')
  })

  it('the worksheet has every cell blank, line numbers included, and two spare rows', () => {
    const { worksheet, key } = pack({ masked: new Set([cellKey(rows[0]!.stepIndices[0]!, '<module>:n')]) })
    expect(worksheet.rows).toHaveLength(key.rows.length + 2)
    expect(worksheet.rows.flat().every((c) => c === '')).toBe(true)
    expect(worksheet.rows.every((r) => r.length === columns.length)).toBe(true)
  })

  it('with the Study mode blanks, only masked cells are blank; the spare rows stay', () => {
    const first = cellKey(rows[0]!.stepIndices[0]!, '<module>:n')
    const { worksheet, key } = pack({ masked: new Set([first]), useStudyBlanks: true })
    expect(worksheet.rows[0]).toEqual(['1', '', '', '', ''])
    expect(worksheet.rows.slice(1, key.rows.length)).toEqual(key.rows.slice(1))
    expect(worksheet.rows.slice(-2)).toEqual([Array(5).fill(''), Array(5).fill('')])
    expect(key.rows[0]).toEqual(['1', '1234', '', '', ''])
  })

  it('an empty mask never prints the answers on the student page', () => {
    expect(pack({ useStudyBlanks: true }).worksheet.rows.flat().join('')).toBe('')
  })

  it('only the Line column: still a blank grid and a mark scheme', () => {
    const lineOnly = buildPrintPack(columns.slice(0, 1), rows, { masked: new Set(), useStudyBlanks: false, code: CODE })
    expect(lineOnly.worksheet.rows).toEqual(Array(17).fill(['']))
    expect(lineOnly.key.rows[0]).toEqual(['1'])
  })

  it('program inputs go to the worksheet only, and only when there are some', () => {
    expect(pack({ inputs: [] }).worksheet.inputs).toBeUndefined()
    const withInputs = pack({ inputs: ['cat', '3'] })
    expect(withInputs.worksheet.inputs).toEqual(['cat', '3'])
    expect(withInputs.key.inputs).toBeUndefined()
  })

  it('the mark scheme carries no program (it is on the worksheet)', () => {
    expect(pack().key).toMatchObject({ title: 'Mark scheme', variant: 'key' })
    expect(pack().key.code).toBeUndefined()
  })

  it('the new options leave an ordinary table unchanged', () => {
    expect(buildTableModel(columns, rows, { variant: 'key' }).rows).toHaveLength(rows.length)
  })
})

describe('printing the pack from the app', () => {
  beforeEach(() => {
    localStorage.clear()
    history.replaceState(null, '', '/')
    setRunnerOverride(new FakeTraceRunner(traces.digitSum))
    useStore.setState({
      ...defaultWorkspace(CODE),
      result: null,
      ranSig: null,
      ranInput: null,
      running: false,
      shared: null,
      sharedLinkInvalid: false,
      challenge: null,
      studyOnRun: null,
      study: null,
      studySessions: {},
      studyOrder: [],
      printJob: 'table',
      exportOptions: { variant: 'key', includeCode: false, packStudyBlanks: false },
    })
  })
  afterEach(() => {
    cleanup()
    useStore.getState().cancelScheduledRerun()
    setRunnerOverride(null)
    vi.restoreAllMocks()
  })

  const region = () => screen.getByTestId('print-region')
  const fire = (type: 'beforeprint' | 'afterprint') => act(() => void window.dispatchEvent(new Event(type)))
  const bodyRows = (section: Element) => [...section.querySelectorAll('tbody tr')]
  const section = (name: 'worksheet' | 'key') => region().querySelector(`[data-print-page="${name}"]`)!

  /** Clicks the menu button; `window.print` fires `beforeprint` as a browser does. */
  async function printPack() {
    const print = vi.spyOn(window, 'print').mockImplementation(() => void window.dispatchEvent(new Event('beforeprint')))
    const user = userEvent.setup()
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /export/i }))
    const dialog = screen.getByRole('dialog', { name: 'Export' })
    return {
      user,
      print,
      dialog,
      click: () => user.click(within(dialog).getByRole('button', { name: 'Print worksheet + answer key' })),
    }
  }

  it('renders two sections: a blank grid with the program, then the mark scheme after a page break', async () => {
    const { click, print } = await printPack()
    await click()
    expect(print).toHaveBeenCalledTimes(1)
    expect([...region().children].map((c) => c.getAttribute('data-print-page'))).toEqual(['worksheet', 'key'])
    expect(section('worksheet').className).toContain('print-page-break')
    expect(section('worksheet')).toHaveTextContent('while n > 0:')
    expect(bodyRows(section('worksheet'))).toHaveLength(bodyRows(section('key')).length + 2)
    const cells = [...section('worksheet').querySelectorAll('tbody td')]
    expect(cells).toHaveLength(17 * 5)
    expect(cells.every((c) => c.textContent === '')).toBe(true)
    expect((bodyRows(section('worksheet'))[0] as HTMLElement).style.height).toBe('2.2em')
    expect(section('key').querySelector('h2')).toHaveTextContent('Mark scheme')
    expect(section('key')).toHaveTextContent('1234')
    expect(section('key').querySelector('pre')).toBeNull()
  })

  it('after printing, Ctrl/⌘+P prints the ordinary table again', async () => {
    const { click } = await printPack()
    await click()
    fire('afterprint')
    expect(useStore.getState().printJob).toBe('table')
    expect(region()).toBeEmptyDOMElement()
    fire('beforeprint')
    expect(region().querySelector('[data-print-page]')).toBeNull()
    expect(within(region()).getByRole('heading', { name: 'Trace table' })).toBeInTheDocument()
  })

  it('uses the program that produced the table, not the edited editor', async () => {
    const { click } = await printPack()
    act(() => useStore.getState().setCode('print("edited later")\n'))
    await click()
    expect(section('worksheet')).toHaveTextContent('while n > 0:')
    expect(region()).not.toHaveTextContent('edited later')
  })

  it('the option keeps the unmasked cells, and warns when nothing is masked', async () => {
    act(() =>
      useStore.setState({
        studyConfig: { maskMode: 'columns', percent: 50, columns: [], cells: [], outputOnly: false, closeCredit: 0.5 },
      }),
    )
    const { user, dialog } = await printPack()
    expect(within(dialog).queryByText(/whole grid will be blank/)).toBeNull()
    await user.click(within(dialog).getByRole('checkbox', { name: 'Use the Study mode blanks on the worksheet' }))
    expect(within(dialog).getByText(/whole grid will be blank/)).toBeInTheDocument()
    act(() => useStore.setState((s) => ({ studyConfig: { ...s.studyConfig, columns: ['<module>:total'] } })))
    expect(within(dialog).queryByText(/whole grid will be blank/)).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'Print worksheet + answer key' }))
    expect(section('worksheet')).toHaveTextContent('1234') // n is not masked
    expect(bodyRows(section('worksheet'))[1]!.textContent).toBe('20') // total starts at a given 0
    expect(bodyRows(section('worksheet'))[3]!.textContent).toBe('5') // and is blank once worked out
  })

  it('a challenge refuses the pack: no menu, no job, and the print view holds only a notice', async () => {
    render(<App />, { wrapper: MemoryRouter })
    await screen.findByRole('table')
    act(() =>
      useStore.setState({
        challenge: { stage: 'active', spec: { steps: 1, executionKey: 'abc' }, checkedOnce: true, hidNothing: false },
      }),
    )
    act(() => useStore.getState().setPrintJob('pack'))
    expect(useStore.getState().printJob).toBe('table')
    expect(screen.getByRole('button', { name: /export/i })).toBeDisabled()
    // even a job queued before the challenge began prints nothing
    act(() => useStore.setState({ printJob: 'pack' }))
    fire('beforeprint')
    expect(region()).toHaveTextContent('Printing is off during a challenge.')
    expect(region().querySelector('table')).toBeNull()
  })
})
