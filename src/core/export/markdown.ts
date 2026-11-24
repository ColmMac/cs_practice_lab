import type { TableModel } from './tableModel'

const longestRun = (s: string, ch: string): number => {
  let best = 0
  let run = 0
  for (const c of s) {
    run = c === ch ? run + 1 : 0
    best = Math.max(best, run)
  }
  return best
}

/**
 * One line of text as a Markdown inline code span, so `_x_`, `*`, `<b>` and friends are shown literally.
 * Pipes are escaped because they would otherwise end the table cell (even inside a code span, per GFM).
 */
function codeSpan(text: string): string {
  const body = text.replaceAll('|', '\\|')
  const fence = '`'.repeat(longestRun(body, '`') + 1)
  // a span can't start/end with a backtick without padding; padding is stripped when both sides have one
  const pad = body.startsWith('`') || body.endsWith('`') || (/^ .* $/.test(body) && body.trim() !== '') ? ' ' : ''
  return `${fence}${pad}${body}${pad}${fence}`
}

/** A table cell: each line is a code span, lines joined with <br> (a cell can't contain a real newline). */
function cell(text: string): string {
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map(codeSpan)
    .join('<br>')
}

/** GitHub-flavoured Markdown: an optional fenced code block, then the table. */
export function toMarkdown(m: TableModel): string {
  const out: string[] = []
  if (m.code) {
    const fence = '`'.repeat(Math.max(3, longestRun(m.code, '`') + 1))
    out.push(`${fence}${m.codeLanguage ?? ''}`, m.code, fence, '')
  }
  const row = (cells: string[]) => `| ${cells.join(' | ')} |`
  out.push(row(m.columns.map((c) => codeSpan(c.header))))
  out.push(row(m.columns.map(() => '---')))
  for (const r of m.rows) out.push(row(r.map(cell)))
  return out.join('\n') + '\n'
}
