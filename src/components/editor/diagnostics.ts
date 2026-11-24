import type { Diagnostic } from '@codemirror/lint'
import type { Text } from '@codemirror/state'
import type { TraceError } from '../../core/types'

/** Turn a trace error into an editor diagnostic (red underline + tooltip), or none. */
export function diagnosticsFor(error: TraceError | undefined, doc: Text): Diagnostic[] {
  if (!error?.line || error.line < 1 || error.line > doc.lines) return []
  if (error.kind === 'awaiting-input' || error.kind === 'cancelled') return []
  const line = doc.line(error.line)
  const indent = line.text.length - line.text.trimStart().length

  let from = line.from + indent
  let to = line.to
  if (error.kind === 'syntax-error' && error.column) {
    from = Math.min(line.from + Math.max(error.column - 1, 0), line.to)
    if (error.endLine === error.line && error.endColumn && error.endColumn > error.column) {
      to = Math.min(line.from + error.endColumn - 1, line.to)
    }
  }
  if (to <= from) {
    // a zero-width range draws nothing: widen it, backwards if we're at the end of the line/document
    if (from < doc.length && from < line.to) to = from + 1
    else from = Math.max(line.from, to - 1)
  }
  if (to <= from) return [] // genuinely empty line
  return [{ from, to, severity: 'error', message: error.message }]
}
