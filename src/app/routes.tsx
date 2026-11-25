import { lazy, Suspense, type ComponentType } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './AppShell'
import { HomePage } from './HomePage'
import { NotFoundPage } from './pages'

/** A page in its own chunk, with the loading line shown until it arrives. */
function lazyRoute(load: () => Promise<ComponentType>) {
  const Page = lazy(async () => ({ default: await load() }))
  return (
    <Suspense
      fallback={
        <p role="status" className="p-4 text-sm">
          Loading…
        </p>
      }
    >
      <Page />
    </Suspense>
  )
}

// Each tool is its own chunk, so `/` and the light tools never download CodeMirror or start Pyodide.
const traceTable = lazyRoute(() => import('./TraceTableRoute').then((m) => m.TraceTableRoute))
const truthTables = lazyRoute(() => import('../components/truth/TruthTablePage').then((m) => m.TruthTablePage))
const numberSystems = lazyRoute(() => import('../components/numbers/NumberSystemsPage').then((m) => m.NumberSystemsPage))
const sorting = lazyRoute(() => import('../components/sorting/SortingPage').then((m) => m.SortingPage))
const about = lazyRoute(() => import('./AboutPage').then((m) => m.AboutPage))
const privacy = lazyRoute(() => import('./PrivacyPage').then((m) => m.PrivacyPage))

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
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
