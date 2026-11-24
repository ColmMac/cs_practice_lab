import { EditorState, Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { diagnosticsFor } from '../../src/components/editor/diagnostics'
import { setTraceLines, traceHighlight, traceLinesField } from '../../src/components/editor/traceHighlight'

const doc = Text.of(['x = 1', '    y = 2 / 0', 'z = 3'])

/** [lineNumber, cssClass] for every decorated line. */
function marks(state: EditorState): [number, string][] {
  const out: [number, string][] = []
  const it = state.field(traceLinesField).iter()
  while (it.value) {
    out.push([state.doc.lineAt(it.from).number, (it.value.spec as { class: string }).class])
    it.next()
  }
  return out
}

describe('trace highlight', () => {
  const start = () => EditorState.create({ doc, extensions: [traceHighlight] })
  const apply = (s: EditorState, hover: number | null, selected: number | null) =>
    s.update({ effects: setTraceLines.of({ hover, selected }) }).state

  it('marks hover softly and the selected line strongly', () => {
    expect(marks(apply(start(), 3, 1))).toEqual([
      [1, 'cm-trace-selected'],
      [3, 'cm-trace-hover'],
    ])
  })

  it('does not double-mark a line that is both hovered and selected', () => {
    expect(marks(apply(start(), 2, 2))).toEqual([[2, 'cm-trace-selected']])
  })

  it('sorts marks even when hover comes before selected', () => {
    expect(marks(apply(start(), 1, 3)).map(([n]) => n)).toEqual([1, 3])
  })

  it('clears with nulls and ignores out-of-range lines', () => {
    expect(marks(apply(apply(start(), 2, 2), null, null))).toEqual([])
    expect(marks(apply(start(), 99, 0))).toEqual([])
  })

  it('moves with edits', () => {
    const s = apply(start(), null, 2)
    const edited = s.update({ changes: { from: 0, insert: 'new line\n' } }).state
    expect(marks(edited)).toEqual([[3, 'cm-trace-selected']])
  })
})

describe('diagnosticsFor', () => {
  it('underlines the code (not the indentation) of a runtime error line', () => {
    const [d] = diagnosticsFor({ kind: 'runtime-error', message: 'ZeroDivisionError: division by zero', line: 2 }, doc)
    expect(doc.sliceString(d!.from, d!.to)).toBe('y = 2 / 0')
    expect(d).toMatchObject({ severity: 'error', message: 'ZeroDivisionError: division by zero' })
  })

  it('uses the column range for syntax errors', () => {
    const [d] = diagnosticsFor(
      { kind: 'syntax-error', message: 'SyntaxError', line: 1, column: 3, endLine: 1, endColumn: 4 },
      doc,
    )
    expect(doc.sliceString(d!.from, d!.to)).toBe('=')
  })

  it('always spans at least one character and stays inside the document', () => {
    const [d] = diagnosticsFor({ kind: 'syntax-error', message: 'm', line: 3, column: 99 }, doc)
    expect(d!.to).toBeGreaterThan(d!.from)
    expect(d!.to).toBeLessThanOrEqual(doc.length)
  })

  it('a column past the end of a line underlines the last character instead of nothing', () => {
    const [d] = diagnosticsFor({ kind: 'syntax-error', message: 'm', line: 1, column: 50 }, doc)
    expect(doc.sliceString(d!.from, d!.to)).toBe('1')
  })

  it('an empty line has nothing to underline', () => {
    expect(diagnosticsFor({ kind: 'runtime-error', message: 'm', line: 2 }, Text.of(['a', '', 'c']))).toEqual([])
  })

  it('produces nothing for missing / out-of-range lines and non-errors', () => {
    expect(diagnosticsFor(undefined, doc)).toEqual([])
    expect(diagnosticsFor({ kind: 'runtime-error', message: 'm' }, doc)).toEqual([])
    expect(diagnosticsFor({ kind: 'runtime-error', message: 'm', line: 50 }, doc)).toEqual([])
    expect(diagnosticsFor({ kind: 'awaiting-input', message: 'm', line: 1 }, doc)).toEqual([])
    expect(diagnosticsFor({ kind: 'cancelled', message: 'm', line: 1 }, doc)).toEqual([])
  })
})
