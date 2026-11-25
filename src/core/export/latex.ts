import { SITE_NAME } from '../../config/site'
import { headerParts, valueWidths, type TableModel } from './tableModel'

/** Characters that need a command in LaTeX (T1 font encoding). Everything else passes through. */
const SPECIAL: Record<string, string> = {
  '\\': '\\textbackslash{}',
  '{': '\\{',
  '}': '\\}',
  $: '\\$',
  '&': '\\&',
  '#': '\\#',
  '^': '\\textasciicircum{}',
  _: '\\_',
  '%': '\\%',
  '~': '\\textasciitilde{}',
  '<': '\\textless{}',
  '>': '\\textgreater{}',
  '|': '\\textbar{}',
  '"': '\\textquotedbl{}',
  "'": '\\textquotesingle{}',
  // symbols this app itself puts in tables
  '⏎': '\\ensuremath{\\hookleftarrow}',
  '–': '--',
  '…': '\\ldots{}',
  '›': '\\guilsinglright{}',
  '⚠': '\\textbf{!}',
}

/** Escapes text for use inside \texttt{...}. Control characters become a visible \x00-style marker. */
export function latexEscape(text: string): string {
  let out = ''
  for (const ch of text) {
    const code = ch.codePointAt(0)!
    if (SPECIAL[ch]) out += SPECIAL[ch]
    else if (code < 32 || code === 127) out += `\\textbackslash{}x${code.toString(16).padStart(2, '0')}`
    else out += ch
  }
  // TeX collapses runs of spaces: make leading, trailing and repeated spaces explicit
  return out.replace(/ {2,}|^ | $/g, (m) => '\\ '.repeat(m.length))
}

const tt = (text: string): string => (text === '' ? '' : `\\texttt{${latexEscape(text)}}`)

const cellLines = (text: string): string[] => text.split('\n').filter((l, i, all) => !(l === '' && i === all.length - 1))

const stack = (parts: string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `\\begin{tabular}[t]{@{}l@{}}${parts.join(' \\\\ ')}\\end{tabular}`

/** A cell; several lines become a small nested one-column table (a plain cell can't break lines). */
const cell = (text: string): string => stack(cellLines(text).map(tt))

/**
 * A cell of a fixed-width column, which TeX breaks at spaces. It never hyphenates typewriter text, so a longer
 * unbroken run is given places to break, or it would print over the next column.
 */
function wrappingCell(text: string, at: number): string {
  const breakable = (line: string): string => {
    const pieces: string[] = []
    let piece = ''
    let run = 0
    for (const ch of line) {
      run = ch === ' ' ? 0 : run + 1
      if (run > at) {
        pieces.push(piece)
        piece = ''
        run = 1
      }
      piece += ch
    }
    return [...pieces, piece].map(latexEscape).join('\\allowbreak{}')
  }
  return cellLines(text)
    .map((line) => (line === '' ? '' : `\\texttt{${breakable(line)}}`))
    .join(' \\newline ')
}

/** Roughly how many typewriter characters fit across the page, counting each column's padding as some of them. */
const PORTRAIT = { chars: 86, padding: 2.4 }
const LANDSCAPE = { chars: 160, padding: 1.5 }
const WRAP = { widest: 40, narrowest: 10 }
/** Width of one typewriter character, in em. */
const TT_EM = 0.53

/**
 * How to fit a table on a page. `null`: it fits portrait as it is. Otherwise it needs a landscape page and small
 * text, and columns longer than `wrapAt` characters become fixed-width ones that wrap.
 */
function wideLayout(m: TableModel): { wrapAt: number; widths: number[]; headers: string[][] } | null {
  const widths = valueWidths(m)
  const plain = m.columns.reduce((sum, c, j) => sum + Math.max(widths[j]!, c.header.length) + PORTRAIT.padding, 0)
  if (plain <= PORTRAIT.chars) return null
  const headers = m.columns.map((c, j) => headerParts(c.header, widths[j]!))
  const total = (cap: number) =>
    headers.reduce((sum, h, j) => sum + Math.max(Math.min(widths[j]!, cap), ...h.map((p) => p.length)) + LANDSCAPE.padding, 0)
  let wrapAt = WRAP.widest
  while (wrapAt > WRAP.narrowest && total(wrapAt) > LANDSCAPE.chars) wrapAt--
  return { wrapAt, widths, headers }
}

export interface LatexOptions {
  /** A complete, compilable document instead of just the table. */
  standalone?: boolean
  /** Above this many rows the table is a `longtable` so it can break across pages. */
  longtableAbove?: number
}

const PACKAGES = ['\\usepackage[T1]{fontenc}', '\\usepackage[utf8]{inputenc}', '\\usepackage{textcomp}', '\\usepackage{booktabs}']

export function toLatex(m: TableModel, opts: LatexOptions = {}): string {
  const long = m.rows.length > (opts.longtableAbove ?? 40)
  const wide = wideLayout(m)
  const wraps = (j: number) => wide !== null && wide.widths[j]! > wide.wrapAt
  const anyWraps = m.columns.some((_, j) => wraps(j))
  const column = (j: number) => (wraps(j) ? `>{\\raggedright\\arraybackslash}p{${(wide!.wrapAt * TT_EM).toFixed(1)}em}` : 'l')
  const spec = m.columns.map((_, j) => column(j)).join(' ')
  const head = `${m.columns.map((c, j) => (wide ? stack(wide.headers[j]!.map(tt)) : tt(c.header))).join(' & ')} \\\\`
  const body = m.rows.map((r) => `${r.map((text, j) => (wraps(j) ? wrappingCell(text, wide!.wrapAt) : cell(text))).join(' & ')} \\\\`)
  const extra = [...(anyWraps ? ['\\usepackage{array}'] : []), ...(long ? ['\\usepackage{longtable}'] : [])]

  const rows = long
    ? [`\\begin{longtable}{${spec}}`, '\\toprule', head, '\\midrule', '\\endhead', ...body, '\\bottomrule', '\\end{longtable}']
    : [`\\begin{tabular}{${spec}}`, '\\toprule', head, '\\midrule', ...body, '\\bottomrule', '\\end{tabular}']
  // grouped, so the smaller text and tighter columns stop at the end of the table
  const table = wide ? ['\\begingroup\\footnotesize\\setlength{\\tabcolsep}{3pt}', ...rows, '\\endgroup'] : rows

  // `\end{verbatim}` inside the code would end the block early
  const code = m.code ? ['\\begin{verbatim}', m.code.replaceAll('\\end{verbatim}', '\\end {verbatim}'), '\\end{verbatim}', ''] : []

  if (opts.standalone) {
    return [
      `% ${m.title}: generated by ${SITE_NAME}`,
      '% Compile with pdflatex. For characters outside Western European text (emoji, CJK) use xelatex or lualatex.',
      '\\documentclass[11pt]{article}',
      ...PACKAGES,
      ...extra,
      wide ? '\\usepackage[landscape,margin=1.5cm]{geometry}' : '\\usepackage[margin=2cm]{geometry}',
      '\\begin{document}',
      `\\section*{${m.title}}`,
      ...code,
      long ? '' : '\\begin{center}\\small',
      ...table,
      long ? '' : '\\end{center}',
      '\\end{document}',
    ]
      .filter((l, i, all) => !(l === '' && all[i - 1] === ''))
      .join('\n')
      .concat('\n')
  }

  return [
    `% ${m.title}: generated by ${SITE_NAME}`,
    `% Needs in your preamble: ${[...PACKAGES.filter((p) => p.includes('fontenc') || p.includes('booktabs')), ...extra].join(' ')}`,
    ...(wide ? ['% This table is wide: put it on a landscape page.'] : []),
    ...code,
    ...table,
  ].join('\n') + '\n'
}
