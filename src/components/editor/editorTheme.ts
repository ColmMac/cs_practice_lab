import { createTheme } from '@uiw/codemirror-themes'
import { tags as t } from '@lezer/highlight'
import { EditorView } from '@codemirror/view'

/**
 * The editor's colours, as plain data so a unit test can check WCAG contrast for every pair (the stock themes fall
 * below 4.5:1 for line numbers and some token colours). Every text colour is checked against the background, the
 * active line, and the two row-highlight overlays below, the worst cases.
 */
export interface EditorPalette {
  background: string
  foreground: string
  caret: string
  selection: string
  activeLine: string
  gutterBackground: string
  gutterForeground: string
  gutterActiveForeground: string
  /** Token colours */
  keyword: string
  string: string
  number: string
  comment: string
  operator: string
  definition: string
  builtin: string
  property: string
  punctuation: string
  invalid: string
  /** Row highlight overlays (hovered / selected table row): an rgba() drawn over the background. */
  hoverLine: string
  selectedLine: string
  selectedBar: string
}

export const PALETTES: { light: EditorPalette; dark: EditorPalette } = {
  light: {
    background: '#ffffff',
    foreground: '#1e293b',
    caret: '#0f172a',
    selection: '#bfdbfe',
    activeLine: '#f1f5f9',
    gutterBackground: '#f1f5f9',
    gutterForeground: '#475569',
    gutterActiveForeground: '#0f172a',
    keyword: '#7e22ce',
    string: '#166534',
    number: '#9a3412',
    comment: '#566378',
    operator: '#9d174d',
    definition: '#1d4ed8',
    builtin: '#115e59',
    property: '#334155',
    punctuation: '#475569',
    invalid: '#b91c1c',
    hoverLine: 'rgba(250, 204, 21, 0.20)',
    selectedLine: 'rgba(250, 204, 21, 0.42)',
    selectedBar: '#b45309',
  },
  dark: {
    background: '#0f172a',
    foreground: '#e2e8f0',
    caret: '#f8fafc',
    selection: '#334155',
    activeLine: '#1e293b',
    gutterBackground: '#0f172a',
    gutterForeground: '#94a3b8',
    gutterActiveForeground: '#f1f5f9',
    keyword: '#e9d5ff',
    string: '#86efac',
    number: '#fdba74',
    comment: '#b4c0d2',
    operator: '#fbcfe8',
    definition: '#bfdbfe',
    builtin: '#5eead4',
    property: '#cbd5e1',
    punctuation: '#cbd5e1',
    invalid: '#fecaca',
    hoverLine: 'rgba(250, 204, 21, 0.11)',
    selectedLine: 'rgba(250, 204, 21, 0.20)',
    selectedBar: '#f59e0b',
  },
}

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace'

function build(mode: 'light' | 'dark') {
  const p = PALETTES[mode]
  return createTheme({
    theme: mode,
    settings: {
      background: p.background,
      foreground: p.foreground,
      caret: p.caret,
      selection: p.selection,
      selectionMatch: p.selection,
      lineHighlight: p.activeLine,
      gutterBackground: p.gutterBackground,
      gutterForeground: p.gutterForeground,
      gutterActiveForeground: p.gutterActiveForeground,
      gutterBorder: 'transparent',
      fontFamily: FONT,
    },
    styles: [
      { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.moduleKeyword], color: p.keyword },
      { tag: [t.string, t.special(t.string), t.regexp], color: p.string },
      { tag: [t.number, t.integer, t.float], color: p.number },
      { tag: [t.comment, t.lineComment, t.blockComment], color: p.comment, fontStyle: 'italic' },
      { tag: [t.operator, t.compareOperator, t.arithmeticOperator, t.logicOperator, t.updateOperator], color: p.operator },
      { tag: [t.definition(t.variableName), t.function(t.variableName), t.className, t.typeName], color: p.definition },
      { tag: [t.bool, t.null, t.self, t.standard(t.variableName), t.atom], color: p.builtin },
      { tag: [t.propertyName, t.attributeName], color: p.property },
      { tag: [t.punctuation, t.bracket, t.separator], color: p.punctuation },
      { tag: [t.meta, t.escape], color: p.builtin },
      { tag: t.invalid, color: p.invalid },
    ],
  })
}

export const lightTheme = build('light')
export const darkTheme = build('dark')

/**
 * Row highlight colours and the editor's accessible name. The table row ↔ line highlight is drawn as an
 * overlay, so its colours are per theme and are part of the contrast check.
 */
export const editorChrome = [
  EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
  EditorView.baseTheme({
    '&light .cm-trace-hover': { backgroundColor: PALETTES.light.hoverLine },
    '&light .cm-trace-selected': { backgroundColor: PALETTES.light.selectedLine, boxShadow: `inset 4px 0 0 ${PALETTES.light.selectedBar}` },
    '&dark .cm-trace-hover': { backgroundColor: PALETTES.dark.hoverLine },
    '&dark .cm-trace-selected': { backgroundColor: PALETTES.dark.selectedLine, boxShadow: `inset 4px 0 0 ${PALETTES.dark.selectedBar}` },
  }),
]
