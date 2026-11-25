import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { App } from '../../src/App'
import { ExportTable } from '../../src/components/export/ExportTable'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import type { TableModel } from '../../src/core/export/tableModel'
import type { TraceResult } from '../../src/core/types'
import { defaultWorkspace } from '../../src/core/workspace'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

vi.mock('html-to-image', () => ({ toPng: vi.fn() }))
import { toPng } from 'html-to-image'

// CodeMirror needs real layout APIs jsdom doesn't have; the editor is covered in the browser.
vi.mock('../../src/components/editor/CodeEditor', () => ({
  CodeEditor: () => {
    const { code, setCode } = useStore()
    return <textarea aria-label="Code editor" value={code} onChange={(e) => setCode(e.target.value)} />
  },
}))

const CLEAN = {
  result: null, ranSig: null, ranInput: null, running: false, hoverStep: null, selectedStep: null, watchErrors: {},
  shared: null, sharedLinkInvalid: false, study: null, studySessions: {}, studyOrder: [],
  exportOptions: { variant: 'key' as const, includeCode: false, packStudyBlanks: false },
  printJob: 'table' as const,
}
const CODE = 'n = 1234\ntotal = 0\nwhile n > 0:\n    digit = n % 10\n    total = total + digit\n    n = n // 10\nprint(total)\n'
const PNG = 'data:image/png;base64,iVBORw0KGgo='

function mount(result: TraceResult = traces.digitSum, workspace: Partial<ReturnType<typeof defaultWorkspace>> = {}) {
  setRunnerOverride(new FakeTraceRunner(result))
  useStore.setState({ ...defaultWorkspace(CODE), ...workspace, ...CLEAN })
  render(<App />, { wrapper: MemoryRouter })
}

/** Records every file the app saves: name → bytes. */
function captureDownloads() {
  const blobs: Blob[] = []
  const files = new Map<string, Blob>()
  vi.stubGlobal('URL', { createObjectURL: (b: Blob) => (blobs.push(b), `blob:t/${blobs.length - 1}`), revokeObjectURL: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    files.set(this.download, blobs[Number(this.href.split('/').pop())]!)
  })
  return files
}
/** File text without the UTF-8 BOM (the BOM bytes themselves are checked separately). */
const textOf = async (b: Blob) => new TextDecoder('utf-8').decode(await b.arrayBuffer())

const exportButton = () => screen.getByRole('button', { name: /export/i })
async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole('table')
  await user.click(exportButton())
  return screen.getByRole('dialog', { name: 'Export' })
}

beforeEach(() => {
  localStorage.clear()
  history.replaceState(null, '', '/')
  vi.mocked(toPng).mockReset()
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun()
  setRunnerOverride(null)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Export menu: availability', () => {
  it('is disabled until there is a table, with a reason', () => {
    const runner = new FakeTraceRunner(traces.digitSum)
    runner.runTrace = () => new Promise(() => {})
    setRunnerOverride(runner)
    useStore.setState({ ...defaultWorkspace(CODE), ...CLEAN })
    render(<App />, { wrapper: MemoryRouter })
    expect(exportButton()).toBeDisabled()
    expect(exportButton()).toHaveAttribute('title', expect.stringMatching(/run a program/i))
  })

  it('is disabled when the run produced no rows (a syntax error)', async () => {
    mount(traces.syntaxError)
    await screen.findByRole('alert')
    expect(exportButton()).toBeDisabled()
  })

  it('opens a labelled dialog and closes on Escape', async () => {
    mount()
    const user = userEvent.setup()
    await openMenu(user)
    expect(exportButton()).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Export' })).not.toBeInTheDocument()
  })
})

describe('Export menu: each format', () => {
  it('copies Markdown (a GFM table) and says so', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getAllByRole('button', { name: 'Copy' })[0]!)
    const md = writeText.mock.calls[0]![0] as string
    expect(md).toContain('| `Line` | `n` | `total` | `digit` | `Output` |')
    expect(md).toContain('| --- | --- | --- | --- | --- |')
    expect(md.split('\n').filter((l) => l.startsWith('| `')).length).toBe(16) // header + 15 rows
    expect(await within(dlg).findByText('Markdown copied to the clipboard.')).toBeInTheDocument()
  })

  it('says when the browser blocked the clipboard', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getAllByRole('button', { name: 'Copy' })[0]!)
    expect(await within(dlg).findByText(/couldn’t copy markdown.*download instead/i)).toBeInTheDocument()
  })

  it('downloads Markdown, CSV (with a BOM), LaTeX (a full document) and JSON with the right names', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount()
    const dlg = await openMenu(user)
    for (const name of ['Download .md', 'Download .csv', 'Download .tex', 'Download .json']) {
      await user.click(within(dlg).getByRole('button', { name }))
    }
    expect([...files.keys()].sort()).toEqual(['trace-table.csv', 'trace-table.json', 'trace-table.md', 'trace-table.tex'])

    const csvBytes = new Uint8Array(await files.get('trace-table.csv')!.arrayBuffer())
    expect([...csvBytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    const csv = await textOf(files.get('trace-table.csv')!)
    expect(csv).toContain('Line,n,total,digit,Output\r\n1,1234,,,\r\n')
    expect(csv.trimEnd().split('\r\n')).toHaveLength(16)

    expect(await textOf(files.get('trace-table.tex')!)).toContain('\\documentclass[11pt]{article}')
    expect(await textOf(files.get('trace-table.md')!)).toContain('| `1` | `1234` |')
    expect(files.get('trace-table.md')!.type).toContain('text/markdown')
    expect(files.get('trace-table.csv')!.type).toContain('text/csv')

    const json = JSON.parse(await textOf(files.get('trace-table.json')!))
    expect(json.schema).toBe('trace-table/v1')
    expect(json.result.steps.length).toBe(traces.digitSum.steps.length)
    expect(await within(dlg).findByText('Saved trace-table.json.')).toBeInTheDocument()
  })

  it('copies just the LaTeX table (no document wrapper) for pasting into a paper', async () => {
    const user = userEvent.setup()
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Copy table' }))
    const tex = writeText.mock.calls[0]![0] as string
    expect(tex).toContain('\\begin{tabular}')
    expect(tex).not.toContain('\\documentclass')
  })
})

describe('Export menu: it exports what is on screen', () => {
  it('hidden columns and Every line are respected', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount(traces.digitSum, { hiddenColumns: ['stack', '<module>:digit'], granularity: 'every-line', displayStyle: 'carry' })
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .csv' }))
    const lines = (await textOf(files.get('trace-table.csv')!)).trimEnd().split('\r\n')
    expect(lines[0]).toBe('Line,n,total,Output')
    expect(lines).toHaveLength(21) // 20 executed lines + header
    expect(lines[2]).toBe('2,1234,0,') // carry-forward cells
  })

  it('a column the user reordered keeps that order', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount(traces.digitSum, { columnOrder: ['<module>:digit', '<module>:total', '<module>:n'] })
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .csv' }))
    expect((await textOf(files.get('trace-table.csv')!)).split('\r\n')[0]).toBe('Line,digit,total,n,Output')
  })

  it('during a study session it exports the FROZEN table, not later live changes', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    act(() => {
      useStore.getState().toggleColumn('<module>:digit')
      useStore.getState().setGranularity('every-line')
    })
    await user.click(exportButton())
    await user.click(within(screen.getByRole('dialog', { name: 'Export' })).getByRole('button', { name: 'Download .csv' }))
    const lines = (await textOf(files.get('trace-table.csv')!)).trimEnd().split('\r\n')
    expect(lines[0]).toBe('Line,n,total,digit,Output')
    expect(lines).toHaveLength(16)
  })

  it('the program and input come from what PRODUCED the table, not the edited editor', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('checkbox', { name: /include the program/i }))
    act(() => useStore.getState().setCode('print("I was edited after the run")\n'))
    await user.click(within(dlg).getByRole('button', { name: 'Download .md' }))
    await user.click(within(dlg).getByRole('button', { name: 'Download .json' }))
    const md = await textOf(files.get('trace-table.md')!)
    expect(md).toContain('n = 1234')
    expect(md).not.toContain('edited after the run')
    expect(JSON.parse(await textOf(files.get('trace-table.json')!)).source.code).toBe(CODE)
  })

  it('"include the program" adds a fenced block to Markdown and a verbatim block to LaTeX', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .md' }))
    expect(await textOf(files.get('trace-table.md')!)).not.toContain('```')
    await user.click(within(dlg).getByRole('checkbox', { name: /include the program/i }))
    await user.click(within(dlg).getByRole('button', { name: 'Download .md' }))
    await user.click(within(dlg).getByRole('button', { name: 'Download .tex' }))
    expect(await textOf(files.get('trace-table.md')!)).toMatch(/^```python\nn = 1234\n/)
    expect(await textOf(files.get('trace-table.tex')!)).toContain('\\begin{verbatim}\nn = 1234')
  })
})

describe('Export menu: answer key vs worksheet', () => {
  it('a worksheet blanks every cell a student would fill in, and keeps the line numbers', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('radio', { name: 'Worksheet' }))
    expect(within(dlg).getByText('Blanks 13 cells (the Study mode mask).')).toBeInTheDocument()
    await user.click(within(dlg).getByRole('button', { name: 'Download .csv' }))
    expect([...files.keys()]).toEqual(['trace-table-worksheet.csv'])
    const lines = (await textOf(files.get('trace-table-worksheet.csv')!)).trimEnd().split('\r\n')
    expect(lines.slice(1, 3)).toEqual(['1,1234,,,', '2,,0,,']) // the starting values are given
    expect(lines.slice(1).map((l) => l.split(',')[0])).toEqual(['1', '2', '4', '5', '6', '4', '5', '6', '4', '5', '6', '4', '5', '6', '7'])
    expect(lines.slice(3).every((l) => l.split(',').slice(1).every((c) => c === ''))).toBe(true)
    expect(lines.slice(3).join('')).not.toMatch(/123|10/) // no answer leaks into a worksheet
  })

  it('uses the study mask: blank only the chosen columns', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount(traces.digitSum, { studyConfig: { maskMode: 'columns', percent: 50, columns: ['<module>:total'], cells: [], outputOnly: false, closeCredit: 0.5 } })
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('radio', { name: 'Worksheet' }))
    expect(within(dlg).getByText('Blanks 4 cells (the Study mode mask).')).toBeInTheDocument()
    await user.click(within(dlg).getByRole('button', { name: 'Download .csv' }))
    const lines = (await textOf(files.get('trace-table-worksheet.csv')!)).trimEnd().split('\r\n')
    expect(lines[1]).toBe('1,1234,,,') // n is still shown
    expect(lines[2]).toBe('2,,0,,') // total starts at a given 0
    expect(lines[4]).toBe('5,,,,') // and is blank once it has to be worked out
  })

  it('says when nothing is masked', async () => {
    const user = userEvent.setup()
    mount(traces.digitSum, { studyConfig: { maskMode: 'columns', percent: 50, columns: [], cells: [], outputOnly: false, closeCredit: 0.5 } })
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('radio', { name: 'Worksheet' }))
    expect(within(dlg).getByText(/nothing is blanked yet/i)).toBeInTheDocument()
  })

  it('follows a running study session\'s mask (random, seeded)', async () => {
    const user = userEvent.setup()
    mount()
    await screen.findByRole('table')
    await user.click(screen.getByRole('button', { name: /^study mode/i }))
    await user.click(screen.getByRole('radio', { name: 'Random' }))
    const pct = screen.getByLabelText('Percentage of cells to hide')
    await user.clear(pct)
    await user.type(pct, '40')
    await user.click(exportButton())
    const dlg = screen.getByRole('dialog', { name: 'Export' })
    await user.click(within(dlg).getByRole('radio', { name: 'Worksheet' }))
    expect(within(dlg).getByText('Blanks 5 cells (the Study mode mask).')).toBeInTheDocument()
  })

  it('an answer key never blanks anything', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .csv' }))
    expect(await textOf(files.get('trace-table.csv')!)).toContain('1,1234,,,')
  })
})

describe('Export menu: PNG', () => {
  it('renders the WHOLE table off-screen at 3× on white, saves a PNG, and cleans up', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    let captured: { rows: number; headers: string[]; parent: string | null } | null = null
    vi.mocked(toPng).mockImplementation(async (node) => {
      captured = {
        rows: node.querySelectorAll('tbody tr').length,
        headers: [...node.querySelectorAll('th')].map((h) => h.textContent ?? ''),
        parent: (node.parentElement as HTMLElement).style.left,
      }
      return PNG
    })
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .png' }))

    await waitFor(() => expect(files.has('trace-table.png')).toBe(true))
    expect(toPng).toHaveBeenCalledWith(expect.any(HTMLElement), { pixelRatio: 3, backgroundColor: '#ffffff' })
    expect(captured).toEqual({ rows: 15, headers: ['Line', 'n', 'total', 'digit', 'Output'], parent: '-100000px' })
    expect(files.get('trace-table.png')!.type).toBe('image/png')
    expect(new Uint8Array(await files.get('trace-table.png')!.arrayBuffer())[1]).toBe(80) // 'P' of the PNG signature
    expect(document.querySelector('.export-table')).toBeNull() // the off-screen copy is gone
    expect(await within(dlg).findByText('Saved trace-table.png.')).toBeInTheDocument()
    expect(within(dlg).getByRole('button', { name: 'Download .png' })).toBeEnabled()
  })

  it('saves a very tall table as numbered parts, each repeating the header row', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    // jsdom has no layout: say each row is 1000px tall
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (this.tagName === 'TR') return 1000
      return this.classList.contains('export-table') ? this.querySelectorAll('tbody tr').length * 1000 : 0
    })
    const drawn: { rows: number; headers: number }[] = []
    vi.mocked(toPng).mockImplementation(async (node) => {
      drawn.push({ rows: node.querySelectorAll('tbody tr').length, headers: node.querySelectorAll('th').length })
      return PNG
    })
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .png' }))

    await waitFor(() => expect(files.has('trace-table-part-2-of-2.png')).toBe(true))
    expect(drawn).toEqual([
      { rows: 8, headers: 5 },
      { rows: 7, headers: 5 },
    ])
    expect(files.has('trace-table.png')).toBe(false)
    expect(await within(dlg).findByText(/saved as 2 images/)).toBeInTheDocument()
  })

  it('a worksheet PNG has blank cells', async () => {
    const user = userEvent.setup()
    captureDownloads()
    let cells: string[] = []
    vi.mocked(toPng).mockImplementation(async (node) => {
      cells = [...node.querySelectorAll('tbody td')].map((c) => c.textContent ?? '')
      return PNG
    })
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('radio', { name: 'Worksheet' }))
    await user.click(within(dlg).getByRole('button', { name: 'Download .png' }))
    await waitFor(() => expect(cells.length).toBe(75)) // 15 rows × 5 columns
    // the mask hides every worked-out cell, printed output included: 15 line numbers and 2 starting values remain
    expect(cells.filter((c) => c !== '')).toHaveLength(17)
    expect(cells.filter((c) => c === '1234')).toHaveLength(1)
    expect(cells.join('')).not.toMatch(/10/)
  })

  it('reports a failure, cleans up, and re-enables the button', async () => {
    const user = userEvent.setup()
    const files = captureDownloads()
    vi.mocked(toPng).mockRejectedValue(new Error('canvas tainted'))
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Download .png' }))
    expect(await within(dlg).findByText(/couldn’t create the image/i)).toBeInTheDocument()
    expect(files.size).toBe(0)
    expect(document.querySelector('.export-table')).toBeNull()
    expect(within(dlg).getByRole('button', { name: 'Download .png' })).toBeEnabled()
  })
})

describe('Printing', () => {
  it('"Print…" asks the browser to print', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    const user = userEvent.setup()
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('button', { name: 'Print…' }))
    expect(print).toHaveBeenCalledTimes(1)
  })

  it('the print region is empty and hidden on screen, built just before printing, removed after', async () => {
    mount()
    await screen.findByRole('table')
    const region = screen.getByTestId('print-region')
    expect(region).toBeEmptyDOMElement()
    expect(region.className).toContain('hidden')
    expect(region.className).toContain('print:block')

    act(() => void window.dispatchEvent(new Event('beforeprint')))
    expect(within(region).getByRole('heading', { name: 'Trace table' })).toBeInTheDocument()
    expect(within(region).getAllByRole('row')).toHaveLength(16)
    expect(within(region).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Line', 'n', 'total', 'digit', 'Output'])

    act(() => void window.dispatchEvent(new Event('afterprint')))
    expect(region).toBeEmptyDOMElement()
  })

  it('hides the whole app when printing', async () => {
    mount()
    await screen.findByRole('table')
    const shell = screen.getByRole('main').parentElement!
    expect(shell.className).toContain('print:hidden')
  })

  it('prints the worksheet and the program when chosen', async () => {
    const user = userEvent.setup()
    mount()
    const dlg = await openMenu(user)
    await user.click(within(dlg).getByRole('radio', { name: 'Worksheet' }))
    await user.click(within(dlg).getByRole('checkbox', { name: /include the program/i }))
    act(() => void window.dispatchEvent(new Event('beforeprint')))
    const region = screen.getByTestId('print-region')
    expect(within(region).getByRole('heading', { name: 'Trace table (worksheet)' })).toBeInTheDocument()
    expect(region).toHaveTextContent('while n > 0:')
    expect(within(region).queryByText('123', { selector: 'td' })).not.toBeInTheDocument()
  })

  it('prints nothing when there is no table', () => {
    const runner = new FakeTraceRunner(traces.digitSum)
    runner.runTrace = () => new Promise(() => {})
    setRunnerOverride(runner)
    useStore.setState({ ...defaultWorkspace(CODE), ...CLEAN })
    render(<App />, { wrapper: MemoryRouter })
    act(() => void window.dispatchEvent(new Event('beforeprint')))
    expect(screen.getByTestId('print-region')).toBeEmptyDOMElement()
  })
})

describe('ExportTable (the static table used for PNG and print)', () => {
  const model: TableModel = {
    title: 'Trace table',
    variant: 'key',
    columns: [{ id: 'a', header: 'a' }, { id: 'b', header: 'b' }],
    rows: [['1', 'x\ny'], ['', '2']],
    code: 'a = 1',
  }

  it('renders headers, rows, and the program', () => {
    render(<ExportTable model={model} />)
    expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['a', 'b'])
    expect(screen.getAllByRole('row')).toHaveLength(3)
    expect(screen.getByText('a = 1')).toBeInTheDocument()
  })

  it('keeps line breaks inside a cell', () => {
    render(<ExportTable model={model} />)
    expect(screen.getByText(/x\s*y/)).toHaveStyle({ whiteSpace: 'pre' })
  })

  it('is always black on white regardless of the app theme (inline styles, no dark: classes)', () => {
    const { container } = render(<ExportTable model={model} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.style.background).toBe('rgb(255, 255, 255)')
    expect(root.style.color).toBe('rgb(17, 17, 17)')
    expect(container.innerHTML).not.toContain('dark:')
  })

  it('gives worksheet rows room to write in', () => {
    render(<ExportTable model={{ ...model, variant: 'worksheet' }} />)
    // inline styles (jsdom would report the computed px value, not the authored em)
    expect((screen.getAllByRole('row')[1] as HTMLElement).style.height).toBe('2.2em')
    expect((screen.getAllByRole('cell')[0] as HTMLElement).style.minWidth).toBe('5em')
  })

  it('fits the page width when printing, and has its natural width otherwise', () => {
    const { container, rerender } = render(<ExportTable model={model} />)
    expect((container.firstElementChild as HTMLElement).style.width).toBe('max-content')
    rerender(<ExportTable model={model} fit />)
    expect((container.firstElementChild as HTMLElement).style.width).toBe('100%')
  })
})
