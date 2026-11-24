import { useEffect } from 'react'
import { CodeEditor } from './components/editor/CodeEditor'
import { InputsPanel } from './components/editor/InputsPanel'
import { Toolbar } from './components/layout/Toolbar'
import { ErrorBanner } from './components/table/ErrorBanner'
import { TraceTable } from './components/table/TraceTable'
import { useStore } from './store'

export function App() {
  const { init, result, code, ranCode, running } = useStore()
  useEffect(() => init(), [init])

  // Ctrl/⌘+Enter runs from anywhere. The editor binds it too and marks the event handled, so skip those.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.defaultPrevented) {
        e.preventDefault()
        void useStore.getState().run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const stale = result !== null && ranCode !== code

  return (
    <div className="flex h-screen flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Toolbar />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <section className="flex min-h-0 flex-col gap-3" aria-label="Code">
          <div className="min-h-[240px] flex-1 overflow-auto rounded border border-slate-300 dark:border-slate-700">
            <CodeEditor />
          </div>
          <InputsPanel />
        </section>

        <section className="min-h-0 overflow-auto" aria-label="Trace">
          {result === null ? (
            <p className="rounded border border-dashed border-slate-300 p-6 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
              {running ? 'Running…' : 'Press ▶ Run (or Ctrl/⌘ + Enter) to generate the trace table.'}
            </p>
          ) : (
            <>
              {stale && (
                <p role="status" className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                  The code has changed since this table was generated — run again to update it.
                </p>
              )}
              <ErrorBanner result={result} />
              <TraceTable result={result} stale={stale} />
            </>
          )}
        </section>
      </main>
    </div>
  )
}
