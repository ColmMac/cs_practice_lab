import { lazy, Suspense, type ComponentType } from 'react'
import { Route, Routes } from 'react-router'
import { loadChunk } from '../components/ui/chunkError'
import { ToolErrorBoundary, type ToolReset } from '../components/ui/ToolErrorBoundary'
import { AppShell } from './AppShell'
import { HomePage } from './HomePage'
import { NotFoundPage } from './pages'
import { TOOL_RESETS } from './toolResets'

/**
 * A page in its own chunk, with the loading line shown until it arrives. The line holds a screen's height open, so the
 * footer isn't painted in view and then pushed out of it (a layout shift). `boundary` goes OUTSIDE Suspense, so it
 * also catches a chunk that fails to load.
 */
function lazyRoute(load: () => Promise<ComponentType>, boundary?: ToolReset) {
  const Page = lazy(() => loadChunk(async () => ({ default: await load() })))
  const page = (
    <Suspense
      fallback={
        <p role="status" className="min-h-dvh p-4 text-sm">
          Loading…
        </p>
      }
    >
      <Page />
    </Suspense>
  )
  return boundary ? <ToolErrorBoundary {...boundary}>{page}</ToolErrorBoundary> : page
}

// Each tool is its own chunk, so `/` and the light tools never download CodeMirror or start Pyodide.
const traceTable = lazyRoute(() => import('./TraceTableRoute').then((m) => m.TraceTableRoute), TOOL_RESETS.traceTable)
const truthTables = lazyRoute(
  () => import('../components/truth/TruthTablePage').then((m) => m.TruthTablePage),
  TOOL_RESETS.truthTables,
)
const numberSystems = lazyRoute(
  () => import('../components/numbers/NumberSystemsPage').then((m) => m.NumberSystemsPage),
  TOOL_RESETS.numberSystems,
)
const sorting = lazyRoute(() => import('../components/sorting/SortingPage').then((m) => m.SortingPage), TOOL_RESETS.sorting)
const about = lazyRoute(() => import('./AboutPage').then((m) => m.AboutPage))
const privacy = lazyRoute(() => import('./PrivacyPage').then((m) => m.PrivacyPage))
const accessibility = lazyRoute(() => import('./AccessibilityPage').then((m) => m.AccessibilityPage))

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route path="trace-table" element={traceTable} />
        <Route path="truth-tables" element={truthTables} />
        <Route path="number-systems" element={numberSystems} />
        <Route path="sorting-visualizer" element={sorting} />
        <Route path="about" element={about} />
        <Route path="privacy" element={privacy} />
        <Route path="accessibility" element={accessibility} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
