import { Prec, type Extension } from '@codemirror/state'
import { keymap } from '@codemirror/view'
import CodeMirror from '@uiw/react-codemirror'
import { useEffect, useMemo, useState } from 'react'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'

export function CodeEditor() {
  const { code, setCode, language, theme, run } = useStore()
  const [langExt, setLangExt] = useState<Extension | null>(null)

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

  return (
    <CodeMirror
      value={code}
      onChange={setCode}
      extensions={extensions}
      theme={theme}
      height="100%"
      className="h-full text-sm"
      aria-label="Code editor"
      basicSetup={{ lineNumbers: true, highlightActiveLine: true, foldGutter: false }}
    />
  )
}
