import { useEffect } from 'react'
import { CodeEditor } from './components/editor/CodeEditor'
import { InputsPanel } from './components/editor/InputsPanel'
import { PrintRegion } from './components/export/PrintRegion'
import { Welcome } from './components/layout/Welcome'
import { EmptyState } from './components/table/EmptyState'
import { Toolbar } from './components/layout/Toolbar'
import { ErrorBanner } from './components/table/ErrorBanner'
import { InputPrompt } from './components/table/InputPrompt'
import { StudyToolbar } from './components/study/StudyToolbar'
import { TableControls } from './components/table/TableControls'
import { TraceTable } from './components/table/TraceTable'
import { SharedBanner } from './components/layout/SharedBanner'
import { WatchPanel } from './components/editor/WatchPanel'
import { runSignature, useStore } from './store'

export function App() {
  const { init, result, ranSig, study, exitStudy, shared } = useStore()
  const signature = useStore((s) => runSignature(s))
  useEffect(() => init(), [init])

  // A share link pasted into a tab that already has the app open only changes the #fragment (no reload).
  useEffect(() => {
    const onHash = () => useStore.getState().openSharedFromHash()
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

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

  const stale = result !== null && ranSig !== signature

  return (
    <>
    <div className="flex h-screen flex-col bg-white text-slate-900 print:hidden dark:bg-slate-950 dark:text-slate-100">
      <Toolbar />
      <SharedBanner />
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[minmax(320px,2fr)_3fr]">
        <section className="flex min-h-0 flex-col gap-3" aria-label="Code">
          <div className="min-h-[240px] flex-1 overflow-auto rounded border border-slate-300 dark:border-slate-700">
            <CodeEditor />
          </div>
          <InputsPanel />
          <WatchPanel />
        </section>

        <section className="min-h-0 overflow-auto" aria-label="Trace" data-scroll-parent>
          {result === null ? (
            <EmptyState />
          ) : (
            <>
              {stale && !study && (
                <p role="status" className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                  The code, inputs or watches have changed since this table was generated — run again to update it.
                </p>
              )}
              {stale && study && (
                <p role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                  The code has changed since this study session began, so the answers below belong to the old program.
                  <button type="button" onClick={exitStudy} className="rounded border border-amber-700 px-2 py-0.5 font-medium">
                    End the session
                  </button>
                </p>
              )}
              {!shared && <Welcome />}
              <ErrorBanner result={result} />
              {result.status === 'awaiting-input' && <InputPrompt prompt={result.inputRequest?.prompt ?? ''} />}
              {result.steps.length > 0 && (study ? <StudyToolbar result={result} /> : <TableControls result={result} />)}
              <TraceTable result={result} stale={stale} />
            </>
          )}
        </section>
      </main>
    </div>
    <PrintRegion />
    </>
  )
}
