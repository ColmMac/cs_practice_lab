import { useEffect } from 'react'
import { AdSlot } from './components/ui/AdSlot'
import { useAdsAllowed } from './components/ui/useAdsAllowed'
import { useProjector } from './components/ui/projector'
import { CodeEditor } from './components/editor/CodeEditor'
import { InputsPanel } from './components/editor/InputsPanel'
import { PseudocodePanel } from './components/editor/PseudocodePanel'
import { PrintRegion } from './components/export/PrintRegion'
import { Welcome } from './components/layout/Welcome'
import { EmptyState } from './components/table/EmptyState'
import { Toolbar } from './components/layout/Toolbar'
import { ErrorBanner } from './components/table/ErrorBanner'
import { InputPrompt } from './components/table/InputPrompt'
import { StudyToolbar } from './components/study/StudyToolbar'
import { TableControls } from './components/table/TableControls'
import { TraceTable } from './components/table/TraceTable'
import { PANE_WIDTH, useSizeVariable } from './components/table/useSizeVariable'
import { SharedBanner } from './components/layout/SharedBanner'
import { ChallengePanel } from './components/layout/ChallengePanel'
import { WatchPanel } from './components/editor/WatchPanel'
import { useProjectorClass } from './components/ui/useProjectorClass'
import { runSignature, useStore } from './store'

/** `preparingStudy`: a practice link is about to replace whatever table is here, so none may show. */
export function App({ preparingStudy = false }: { preparingStudy?: boolean }) {
  const { init, result, ranSig, study, exitStudy, shared, challenge, endChallenge } = useStore()
  const signature = useStore((s) => runSignature(s))
  useProjectorClass()
  const paneRef = useSizeVariable(PANE_WIDTH)
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

  const projector = useProjector((s) => s.on)
  // `preparingStudy`: a practice link is about to start Study mode
  const ads = useAdsAllowed(preparingStudy || study !== null || challenge !== null || projector)

  const stale = result !== null && ranSig !== signature
  // A challenge shows its table only once it is masked; every other state shows the panel instead.
  const gated = challenge !== null && !(challenge.stage === 'active' && study)

  return (
    <>
    {/* Wide screens: exactly the space under the nav, so each column scrolls inside it. The footer is below. */}
    <div className="flex flex-col lg:h-[calc(100dvh-var(--nav-h))] print:hidden">
      <Toolbar />
      <SharedBanner />
      {/* Phones: the page scrolls, the code column keeps its full height and the trace pane is a fixed-height box
          (it must stay the table's scroll container). Wide screens: each column scrolls itself. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[max-content_60dvh] gap-4 p-4 lg:grid-cols-[minmax(320px,2fr)_3fr] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto" aria-label="Code">
          <div className="min-h-[240px] flex-1 overflow-auto rounded border border-slate-300 dark:border-slate-700">
            <CodeEditor />
          </div>
          <PseudocodePanel />
          <InputsPanel />
          <WatchPanel />
          {/* wide screens only: on phones this spot is between the editor and the table */}
          <AdSlot ads={ads} at="desktop" />
        </section>

        <section ref={paneRef} className="min-h-0 overflow-auto" aria-label="Trace" data-scroll-parent>
          {gated ? (
            <ChallengePanel />
          ) : preparingStudy || result === null ? (
            <EmptyState />
          ) : (
            // as wide as the table needs; what sits above the table stays put when the pane scrolls sideways
            <div className="w-fit min-w-full">
              {/* z-20: its pop-ups must open over the table's sticky header */}
              <div className="sticky left-0 z-20 w-[var(--pane-width,100%)]">
                {stale && !study && (
                  <p role="status" className="mb-2 text-xs text-amber-800 dark:text-amber-300">
                    The code, inputs or watches have changed since this table was generated: run it again.
                  </p>
                )}
                {stale && study && (
                  <p role="alert" className="mb-2 flex flex-wrap items-center gap-2 text-xs text-amber-900 dark:text-amber-200">
                    The code has changed since this {challenge ? 'challenge' : 'study session'} began, so the answers below belong to the old
                    program.
                    <button
                      type="button"
                      onClick={challenge ? endChallenge : exitStudy}
                      className="rounded border border-amber-700 px-2 py-0.5 font-medium"
                    >
                      {challenge ? 'End the challenge' : 'End the session'}
                    </button>
                  </p>
                )}
                {!shared && <Welcome />}
                <ErrorBanner result={result} />
                {result.status === 'awaiting-input' && <InputPrompt prompt={result.inputRequest?.prompt ?? ''} />}
                {result.steps.length > 0 && (study ? <StudyToolbar result={result} /> : <TableControls result={result} />)}
              </div>
              <TraceTable result={result} stale={stale} />
            </div>
          )}
        </section>
        <AdSlot ads={ads} at="phone" />
      </main>
    </div>
    <PrintRegion />
    </>
  )
}
