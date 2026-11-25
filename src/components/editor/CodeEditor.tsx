import { linter, setDiagnostics } from '@codemirror/lint'
import { Prec, type Extension } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'
import { useProjector } from '../ui/projector'
import { useTheme } from '../ui/theme'
import { diagnosticsFor } from './diagnostics'
import { darkTheme, editorChrome, lightTheme } from './editorTheme'
import { setTraceLines, traceHighlight } from './traceHighlight'

export function CodeEditor() {
  const { code, setCode, language, run, result, hoverStep, selectedStep } = useStore()
  const theme = useTheme((s) => s.theme)
  const [langExt, setLangExt] = useState<Extension | null>(null)
  const [view, setView] = useState<EditorView | null>(null)
  const scrolledFor = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    getLanguage(language)
      .editorExtension()
      .then((ext) => !cancelled && setLangExt(ext))
    return () => {
      cancelled = true
    }
  }, [language])

  const extensions = useMemo(
    () => [
      ...(langExt ? [langExt] : []),
      traceHighlight,
      editorChrome,
      // Installs the lint state + underline decorations permanently. Without it, setDiagnostics() would
      // append them to the config at runtime, and @uiw/react-codemirror's reconfigures would discard them.
      linter(null),
      // Beats CodeMirror's default Mod-Enter (insert blank line)
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: () => {
              void run()
              return true
            },
          },
        ]),
      ),
    ],
    [langExt, run],
  )

  // Table row ↔ editor line: hover is soft, a clicked row is strong and scrolled into view.
  const lineOf = (step: number | null) => (step === null ? null : (result?.steps[step]?.lineNumber ?? null))
  const hoverLine = lineOf(hoverStep)
  const selectedLine = lineOf(selectedStep)
  useEffect(() => {
    if (!view) return
    view.dispatch({ effects: setTraceLines.of({ hover: hoverLine, selected: selectedLine }) })
    if (selectedLine !== null && selectedLine !== scrolledFor.current && selectedLine <= view.state.doc.lines) {
      view.dispatch({ effects: EditorView.scrollIntoView(view.state.doc.line(selectedLine).from, { y: 'nearest' }) })
    }
    scrolledFor.current = selectedLine
  }, [view, hoverLine, selectedLine])

  // A new font size changes every line's height: CodeMirror has to measure again.
  const projector = useProjector((s) => s.on)
  useEffect(() => {
    view?.requestMeasure()
  }, [view, projector])

  // Errors from the last run become a red underline on the offending line.
  useEffect(() => {
    if (!view) return
    view.dispatch(setDiagnostics(view.state, diagnosticsFor(result?.error, view.state.doc)))
  }, [view, result])

  return (
    <CodeMirror
      value={code}
      onChange={setCode}
      onCreateEditor={setView}
      extensions={extensions}
      theme={theme === 'dark' ? darkTheme : lightTheme}
      height="100%"
      className="h-full text-sm projector:text-[1.18rem]"
      aria-label="Code editor"
      basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
    />
  )
}
