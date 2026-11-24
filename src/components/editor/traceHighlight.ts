import { RangeSetBuilder, StateEffect, StateField, type Text } from '@codemirror/state'
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view'

export interface TraceLines {
  /** 1-based line under the mouse in the trace table */
  hover: number | null
  /** 1-based line of the clicked table row */
  selected: number | null
}

export const setTraceLines = StateEffect.define<TraceLines>()

const hoverMark = Decoration.line({ class: 'cm-trace-hover' })
const selectedMark = Decoration.line({ class: 'cm-trace-selected' })

function build(doc: Text, t: TraceLines): DecorationSet {
  const marks: [number, Decoration][] = []
  const ok = (n: number | null): n is number => n !== null && n >= 1 && n <= doc.lines
  if (ok(t.selected)) marks.push([doc.line(t.selected).from, selectedMark])
  if (ok(t.hover) && t.hover !== t.selected) marks.push([doc.line(t.hover).from, hoverMark])
  marks.sort((a, b) => a[0] - b[0]) // RangeSetBuilder needs ascending order
  const b = new RangeSetBuilder<Decoration>()
  for (const [from, deco] of marks) b.add(from, from, deco)
  return b.finish()
}

export const traceLinesField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) if (e.is(setTraceLines)) deco = build(tr.state.doc, e.value)
    return deco
  },
  provide: (f) => EditorView.decorations.from(f),
})

/** Line decorations driven by `setTraceLines`: soft for hover, strong with a left bar for the selected row.
 * Their colours are per theme and live in editorTheme.ts (they are part of the contrast check). */
export const traceHighlight = [
  traceLinesField,
]
