import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyColumnPrefs, deriveColumns } from '../../src/core/derive/columns'
import { deriveRows, type RowOptions } from '../../src/core/derive/rows'
import { copyText, dataUrlToBlob, downloadText, MIME } from '../../src/core/export/download'
import { CSV_BOM, neutraliseFormula, toCsv } from '../../src/core/export/csv'
import { JSON_SCHEMA, toJson } from '../../src/core/export/json'
import { latexEscape, toLatex } from '../../src/core/export/latex'
import { toMarkdown } from '../../src/core/export/markdown'
import { buildTableModel, exportBaseName, type TableModel } from '../../src/core/export/tableModel'
import { maskableCells, selectMasks } from '../../src/core/study/mask'
import { DEFAULT_STUDY_CONFIG } from '../../src/core/study/types'
import type { TraceResult } from '../../src/core/types'
import { formatPythonValue } from '../../src/languages/python/format'
import { traces } from './fixtures'

// ───────────── helpers ─────────────

const model = (over: Partial<TableModel> = {}): TableModel => ({
  title: 'Trace table',
  variant: 'key',
  columns: [{ id: 'a', header: 'a' }, { id: 'b', header: 'b' }],
  rows: [['1', '2']],
  ...over,
})
const one = (cellText: string, header = 'x'): TableModel => model({ columns: [{ id: 'x', header }], rows: [[cellText]] })

function realModel(result: TraceResult, variant: 'key' | 'worksheet', options: RowOptions = { granularity: 'compact', display: 'exam' }, includeCode = false) {
  const columns = applyColumnPrefs(deriveColumns(result), { hidden: ['stack'], order: [] })
  const rows = deriveRows(result, columns, formatPythonValue, options)
  const masked = selectMasks(maskableCells(rows, columns), DEFAULT_STUDY_CONFIG, 1)
  return buildTableModel(columns, rows, { variant, masked, includeCode, code: 'n = 1234\nprint(n)\n', codeLanguage: 'python' })
}

/** Does every { have a } (ignoring \{ and \}), and does every \begin have a matching \end? */
function texProblems(source: string): string[] {
  // TeX reads a verbatim body literally, so braces in the student's program are fine there
  const tex = source.replace(/(\\begin\{verbatim\})[\s\S]*?(\\end\{verbatim\})/g, '$1$2')
  const problems: string[] = []
  let depth = 0
  for (let i = 0; i < tex.length; i++) {
    if (tex[i] === '\\') { i++; continue } // skips \{ \} \\ \% etc.
    if (tex[i] === '{') depth++
    if (tex[i] === '}' && --depth < 0) { problems.push(`unbalanced } at ${i}`); depth = 0 }
  }
  if (depth !== 0) problems.push(`unclosed { (${depth})`)
  const stack: string[] = []
  for (const m of tex.matchAll(/\\(begin|end)\{(\w+)\}/g)) {
    if (m[1] === 'begin') stack.push(m[2]!)
    else if (stack.pop() !== m[2]) problems.push(`mismatched \\end{${m[2]}}`)
  }
  if (stack.length) problems.push(`unclosed environment ${stack.join(',')}`)
  return problems
}

// ───────────── buildTableModel ─────────────

describe('buildTableModel', () => {
  it('uses the visible columns and the displayed cell text, in the displayed order', () => {
    const m = realModel(traces.digitSum, 'key')
    expect(m.columns.map((c) => c.header)).toEqual(['Line', 'n', 'total', 'digit', 'Output'])
    expect(m.rows).toHaveLength(15)
    expect(m.rows[0]).toEqual(['1', '1234', '', '', ''])
    expect(m.rows.at(-1)).toEqual(['7', '', '', '', '10'])
    expect(m.title).toBe('Trace table')
  })

  it('qualifies variables inside functions, like the Column Manager does', () => {
    expect(realModel(traces.factorial, 'key').columns.map((c) => c.header)).toContain('fact.n')
  })

  it('a worksheet blanks exactly the masked cells and keeps Line numbers', () => {
    const key = realModel(traces.digitSum, 'key')
    const sheet = realModel(traces.digitSum, 'worksheet')
    expect(sheet.title).toBe('Trace table (worksheet)')
    expect(sheet.variant).toBe('worksheet')
    expect(sheet.rows.map((r) => r[0])).toEqual(key.rows.map((r) => r[0])) // line numbers stay
    expect(sheet.rows.flat().filter((c, i) => i % 5 !== 0 && c !== '')).toEqual([]) // everything written is blank
  })

  it('a worksheet only blanks what the mask says (e.g. just the Output column)', () => {
    const columns = applyColumnPrefs(deriveColumns(traces.digitSum), { hidden: [], order: [] })
    const rows = deriveRows(traces.digitSum, columns, formatPythonValue)
    const masked = selectMasks(maskableCells(rows, columns), { ...DEFAULT_STUDY_CONFIG, outputOnly: true }, 1)
    const sheet = buildTableModel(columns, rows, { variant: 'worksheet', masked })
    expect(sheet.rows.at(-1)).toEqual(['7', '', '', '', ''])
    expect(sheet.rows[0]).toEqual(['1', '1234', '', '', '']) // n is NOT blanked
  })

  it('an answer key ignores the mask completely', () => {
    const columns = applyColumnPrefs(deriveColumns(traces.digitSum), { hidden: [], order: [] })
    const rows = deriveRows(traces.digitSum, columns, formatPythonValue)
    const masked = new Set(['0:<module>:n'])
    expect(buildTableModel(columns, rows, { variant: 'key', masked }).rows[0]).toEqual(['1', '1234', '', '', ''])
  })

  it('includes the program only when asked, without trailing blank lines', () => {
    const base = { variant: 'key' as const, code: 'x = 1\n\n\n', codeLanguage: 'python' }
    const cols = applyColumnPrefs(deriveColumns(traces.digitSum), { hidden: [], order: [] })
    const rows = deriveRows(traces.digitSum, cols, formatPythonValue)
    expect(buildTableModel(cols, rows, base).code).toBeUndefined()
    expect(buildTableModel(cols, rows, { ...base, includeCode: true }).code).toBe('x = 1')
    expect(buildTableModel(cols, rows, { ...base, includeCode: true, code: '' }).code).toBeUndefined()
  })

  it('a table with no rows still has its header', () => {
    const cols = applyColumnPrefs(deriveColumns(traces.digitSum), { hidden: [], order: [] })
    expect(buildTableModel(cols, [], { variant: 'key' })).toMatchObject({ rows: [], columns: expect.any(Array) })
  })

  it('file names', () => {
    expect(exportBaseName('key')).toBe('trace-table')
    expect(exportBaseName('worksheet')).toBe('trace-table-worksheet')
  })
})

// ───────────── Markdown ─────────────

describe('toMarkdown', () => {
  it('is a GFM table with a separator row, values as code spans', () => {
    expect(toMarkdown(model())).toBe('| `a` | `b` |\n| --- | --- |\n| `1` | `2` |\n')
  })

  it('leaves empty cells empty', () => {
    expect(toMarkdown(model({ rows: [['', '2']] }))).toContain('|  | `2` |')
  })

  it('escapes pipes (they would end the cell), also in headers such as a watch `a | b`', () => {
    const md = toMarkdown(one('x | y', 'a | b'))
    expect(md).toContain('| `a \\| b` |')
    expect(md).toContain('| `x \\| y` |')
    expect(md.split('\n')[0]!.match(/(?<!\\)\|/g)).toHaveLength(2) // only the two real cell borders
  })

  it('shows emphasis and HTML characters literally', () => {
    const md = toMarkdown(one('_x_ *y* <b>z</b> [a](b) #1'))
    expect(md).toContain('`_x_ *y* <b>z</b> [a](b) #1`')
  })

  it('uses longer fences when a value contains backticks, and pads one that starts or ends with one', () => {
    expect(toMarkdown(one('a`b'))).toContain('``a`b``')
    expect(toMarkdown(one('``'))).toContain('` `` `')
    expect(toMarkdown(one('`x'))).toContain('`` `x ``')
    expect(toMarkdown(one('x`'))).toContain('`` x` ``')
  })

  it('keeps meaningful spaces', () => {
    expect(toMarkdown(one('  indented'))).toContain('`  indented`')
    expect(toMarkdown(one(' both '))).toContain('`  both  `') // padded so the surrounding spaces survive
  })

  it('writes a multi-line cell as separate spans joined with <br>', () => {
    expect(toMarkdown(one('line 1\nline 2\n'))).toContain('| `line 1`<br>`line 2` |')
    expect(toMarkdown(one('a\n\nb'))).toContain('`a`<br>`b`') // blank lines don't produce empty spans
  })

  it('puts the program in a fenced block first, with a fence longer than any backtick run inside', () => {
    const md = toMarkdown(model({ code: "s = '```'\nprint(s)", codeLanguage: 'python' }))
    expect(md.startsWith("````python\ns = '```'\nprint(s)\n````\n\n| `a`")).toBe(true)
  })

  it('has no fence when code is absent, and ends with a newline', () => {
    const md = toMarkdown(model())
    expect(md).not.toContain('```')
    expect(md.endsWith('\n')).toBe(true)
  })

  it('handles an empty table', () => {
    expect(toMarkdown(model({ rows: [] }))).toBe('| `a` | `b` |\n| --- | --- |\n')
  })

  it('unicode passes through', () => {
    expect(toMarkdown(one('café 漢字 😀'))).toContain('`café 漢字 😀`')
  })
})

// ───────────── CSV ─────────────

describe('toCsv', () => {
  it('is RFC 4180: header, CRLF line endings, trailing CRLF', () => {
    expect(toCsv(model())).toBe('a,b\r\n1,2\r\n')
  })

  it('quotes fields with commas, quotes and newlines, doubling quotes', () => {
    expect(toCsv(one('a,b'))).toBe('x\r\n"a,b"\r\n')
    expect(toCsv(one('say "hi"'))).toBe('x\r\n"say ""hi"""\r\n')
    expect(toCsv(one('l1\nl2'))).toBe('x\r\n"l1\nl2"\r\n')
    expect(toCsv(one('l1\r\nl2'))).toBe('x\r\n"l1\r\nl2"\r\n')
  })

  it('quotes values with leading or trailing spaces so they survive', () => {
    expect(toCsv(one(' a'))).toBe('x\r\n" a"\r\n')
    expect(toCsv(one('a '))).toBe('x\r\n"a "\r\n')
  })

  it('keeps empty cells empty and the column count constant', () => {
    expect(toCsv(model({ rows: [['', ''], ['1', '']] }))).toBe('a,b\r\n,\r\n1,\r\n')
  })

  it('a value such as a list keeps its commas safe', () => {
    expect(toCsv(one('[1, 2, 3]'))).toBe('x\r\n"[1, 2, 3]"\r\n')
  })

  describe('spreadsheet formula injection', () => {
    it.each(['=1+1', '+SUM(A1)', '-2+3', '@SUM(A1)', '\t=1', '\r=1', '=cmd|\' /C calc\'!A0'])('neutralises %j', (text) => {
      expect(neutraliseFormula(text)).toBe(`'${text}`)
    })

    it.each(['-5', '+3', '-2.5', '.5', '-.5', '1e5', '-1.5E-3', '42', 'plain', "'quoted'", '"=1"', '[=1]'])('leaves %j alone', (text) => {
      expect(neutraliseFormula(text)).toBe(text)
    })

    it('applies to cells and to headers (a watch label can be anything)', () => {
      const csv = toCsv(model({ columns: [{ id: 'x', header: '=evil()' }], rows: [['=1+1'], ['-7']] }))
      expect(csv).toBe("'=evil()\r\n'=1+1\r\n-7\r\n")
    })

    it('still quotes the neutralised text when needed', () => {
      expect(toCsv(one('=a,b'))).toBe('x\r\n"\'=a,b"\r\n')
    })
  })

  it('exposes the BOM separately so only downloads get it', () => {
    expect(CSV_BOM).toBe('\uFEFF')
    expect(toCsv(model()).startsWith(CSV_BOM)).toBe(false)
  })

  it('round-trips through a spec-following parser', () => {
    const tricky = ['a,b', 'say "hi"', 'l1\nl2', ' pad ', '', 'plain', '😀 é']
    const text = toCsv(model({ columns: [{ id: 'x', header: 'h' }], rows: tricky.map((t) => [t]) }))
    expect(parseCsv(text).slice(1).map((r) => r[0])).toEqual(tricky)
  })
})

/** Minimal RFC 4180 parser, to prove the writer's output reads back. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') quoted = false
      else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r' && text[i + 1] === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++ }
    else field += c
  }
  return rows
}

// ───────────── LaTeX ─────────────

describe('latexEscape', () => {
  it.each([
    ['\\', '\\textbackslash{}'], ['{', '\\{'], ['}', '\\}'], ['$', '\\$'], ['&', '\\&'], ['#', '\\#'], ['^', '\\textasciicircum{}'],
    ['_', '\\_'], ['%', '\\%'], ['~', '\\textasciitilde{}'], ['<', '\\textless{}'], ['>', '\\textgreater{}'], ['|', '\\textbar{}'],
    ['"', '\\textquotedbl{}'], ["'", '\\textquotesingle{}'], ['⏎', '\\ensuremath{\\hookleftarrow}'], ['–', '--'], ['…', '\\ldots{}'],
    ['›', '\\guilsinglright{}'], ['⚠', '\\textbf{!}'],
  ])('%j → %s', (ch, want) => expect(latexEscape(ch)).toBe(want))

  it('escapes every special in one string, in order', () => {
    expect(latexEscape('50% of $x_1 & #2')).toBe('50\\% of \\$x\\_1 \\& \\#2')
  })

  it('makes repeated, leading and trailing spaces explicit (TeX would collapse them)', () => {
    expect(latexEscape('a  b')).toBe('a\\ \\ b')
    expect(latexEscape(' a')).toBe('\\ a')
    expect(latexEscape('a ')).toBe('a\\ ')
    expect(latexEscape('a b')).toBe('a b')
  })

  it('turns control characters into a visible marker', () => {
    expect(latexEscape('\x00\x1f\x7f')).toBe('\\textbackslash{}x00\\textbackslash{}x1f\\textbackslash{}x7f')
  })

  it('a hostile string cannot introduce a TeX command', () => {
    const hostile = '\\input{/etc/passwd} \\write18{rm -rf} \\end{document} {{{ }}} %comment $$ ^^M'
    const out = latexEscape(hostile)
    expect(out).not.toMatch(/(?<!\\textbackslash\{\})\\(?!textbackslash|\{|\}|\$|&|#|_|%|textasciicircum|textasciitilde|textless|textgreater|textbar|textquotedbl|textquotesingle|ensuremath|ldots|guilsinglright|textbf|\s)/)
    expect(texProblems(out)).toEqual([])
    expect(out).not.toMatch(/(?<!\\)[%$&#^_]/)
  })
})

describe('toLatex', () => {
  it('writes a booktabs tabular with \\texttt cells', () => {
    expect(toLatex(model())).toBe(
      [
        '% Trace table: generated by Trace Table Studio',
        '% Needs in your preamble: \\usepackage[T1]{fontenc} \\usepackage{booktabs}',
        '\\begin{tabular}{l l}',
        '\\toprule',
        '\\texttt{a} & \\texttt{b} \\\\',
        '\\midrule',
        '\\texttt{1} & \\texttt{2} \\\\',
        '\\bottomrule',
        '\\end{tabular}',
        '',
      ].join('\n'),
    )
  })

  it('leaves empty cells empty', () => {
    expect(toLatex(model({ rows: [['', '2']] }))).toContain(' & \\texttt{2} \\\\')
  })

  it('escapes headers and cells', () => {
    const tex = toLatex(one('a_b 50%', 'nums[j] > nums[j+1]'))
    expect(tex).toContain('\\texttt{nums[j] \\textgreater{} nums[j+1]}')
    expect(tex).toContain('\\texttt{a\\_b 50\\%}')
  })

  it('a multi-line cell becomes a nested one-column table', () => {
    expect(toLatex(one('a\nb'))).toContain('\\begin{tabular}[t]{@{}l@{}}\\texttt{a} \\\\ \\texttt{b}\\end{tabular}')
  })

  it('switches to longtable above 40 rows (and lists the package)', () => {
    const many = model({ rows: Array.from({ length: 41 }, (_, i) => [String(i), 'x']) })
    const tex = toLatex(many)
    expect(tex).toContain('\\begin{longtable}{l l}')
    expect(tex).toContain('\\endhead')
    expect(tex).toContain('\\usepackage{longtable}')
    expect(toLatex(model({ rows: Array.from({ length: 40 }, () => ['1', '2']) }))).toContain('\\begin{tabular}')
  })

  it('includes the program as a verbatim block, and a hostile \\end{verbatim} cannot end it early', () => {
    const tex = toLatex(model({ code: 'x = 1\n\\end{verbatim}\n\\input{evil}' }))
    expect(tex).toContain('\\begin{verbatim}\nx = 1')
    expect(tex).not.toMatch(/\\end\{verbatim\}\n\\input/)
    expect(texProblems(tex)).toEqual([])
  })

  describe('standalone document', () => {
    const tex = toLatex(model(), { standalone: true })

    it('is a complete document with the packages the table needs', () => {
      expect(tex).toContain('\\documentclass[11pt]{article}')
      for (const p of ['[T1]{fontenc}', '[utf8]{inputenc}', '{textcomp}', '{booktabs}']) expect(tex).toContain(`\\usepackage${p}`)
      expect(tex).toContain('\\begin{document}')
      expect(tex.trimEnd().endsWith('\\end{document}')).toBe(true)
      expect(tex).toContain('\\section*{Trace table}')
    })

    it('has balanced braces and environments', () => {
      expect(texProblems(tex)).toEqual([])
      expect(texProblems(toLatex(model({ code: 'a { b' }), { standalone: true }))).toEqual([])
    })

    it('uses longtable for long tables without wrapping it in a centered block', () => {
      const long = toLatex(model({ rows: Array.from({ length: 60 }, () => ['1', '2']) }), { standalone: true })
      expect(long).toContain('\\usepackage{longtable}')
      expect(long).not.toContain('\\begin{center}')
      expect(texProblems(long)).toEqual([])
    })

    it('has no doubled blank lines', () => {
      expect(tex).not.toMatch(/\n\n\n/)
    })
  })

  it('every real table in this suite passes the structural checks', () => {
    for (const r of [traces.digitSum, traces.factorial, traces.zeroDivision, traces.watchesFn]) {
      for (const variant of ['key', 'worksheet'] as const) {
        const m = realModel(r, variant, { granularity: 'every-line', display: 'carry' }, true)
        expect(texProblems(toLatex(m)), 'fragment').toEqual([])
        expect(texProblems(toLatex(m, { standalone: true })), 'standalone').toEqual([])
      }
    }
  })

  it('handles an empty table', () => {
    expect(texProblems(toLatex(model({ rows: [] })))).toEqual([])
  })
})

// ───────────── JSON ─────────────

describe('toJson', () => {
  const input = () => {
    const table = realModel(traces.digitSum, 'key')
    return { result: traces.digitSum, code: 'n = 1234', stdin: ['a'], language: 'python', granularity: 'compact' as const, display: 'exam' as const, variant: 'key' as const, table }
  }

  it('is valid JSON with the schema, source, view, table and the full trace', () => {
    const parsed = JSON.parse(toJson(input()))
    expect(parsed.schema).toBe(JSON_SCHEMA)
    expect(parsed.source).toEqual({ language: 'python', code: 'n = 1234', stdin: ['a'] })
    expect(parsed.view).toEqual({ granularity: 'compact', display: 'exam', variant: 'key', columns: ['line', '<module>:n', '<module>:total', '<module>:digit', 'output'] })
    expect(parsed.table.rows).toHaveLength(15)
    expect(parsed.result.steps).toHaveLength(traces.digitSum.steps.length)
    expect(parsed.result.status).toBe('ok')
  })

  it('the embedded trace is lossless', () => {
    expect(JSON.parse(toJson(input())).result).toEqual(JSON.parse(JSON.stringify(traces.digitSum)))
  })

  it('is stable and ends with a newline', () => {
    expect(toJson(input())).toBe(toJson(input()))
    expect(toJson(input()).endsWith('}\n')).toBe(true)
  })
})

// ───────────── download / copy ─────────────

describe('downloadText / dataUrlToBlob / copyText', () => {
  const created: Blob[] = []
  let clicked: { download: string; href: string }[] = []
  let click: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    created.length = 0
    clicked = []
    vi.stubGlobal('URL', { createObjectURL: (b: Blob) => (created.push(b), `blob:test/${created.length}`), revokeObjectURL: vi.fn() })
    click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ download: this.download, href: this.href })
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    click.mockRestore()
    vi.useRealTimers()
  })

  it('saves text through a temporary link and cleans up', () => {
    vi.useFakeTimers()
    downloadText('trace-table.md', '| a |', MIME.markdown)
    expect(clicked).toEqual([{ download: 'trace-table.md', href: 'blob:test/1' }])
    expect(created[0]!.type).toBe('text/markdown;charset=utf-8')
    expect(document.querySelector('a[download]')).toBeNull() // the link does not linger
    vi.advanceTimersByTime(1500)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1')
  })

  it('keeps the exact bytes, including a UTF-8 BOM (Blob.text() would hide it, so check the bytes)', async () => {
    downloadText('x.csv', CSV_BOM + 'a,b\r\n', MIME.csv)
    const bytes = new Uint8Array(await created[0]!.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)).toBe('\uFEFFa,b\r\n')
  })

  it('decodes a data URL into a typed Blob with the right bytes', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=')
    expect(blob.type).toBe('image/png')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]))
  })

  it('copyText reports success and failure without throwing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    expect(await copyText('hello')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) }, configurable: true })
    expect(await copyText('x')).toBe(false)
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    expect(await copyText('x')).toBe(false)
  })
})
