import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './AppShell'
import { HomePage } from './HomePage'
import { NotFoundPage } from './pages'

// Each tool is its own chunk, so `/` and the light tools never download CodeMirror or start Pyodide.
const TraceTablePage = lazy(() => import('../App').then((m) => ({ default: m.App })))

const TruthTablePage = lazy(() => import('../components/truth/TruthTablePage').then((m) => ({ default: m.TruthTablePage })))

const SortingPage = lazy(() => import('../components/sorting/SortingPage').then((m) => ({ default: m.SortingPage })))

const NumberSystemsPage = lazy(() =>
  import('../components/numbers/NumberSystemsPage').then((m) => ({ default: m.NumberSystemsPage })),
)


export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="trace-table"
          element={
            <Suspense fallback={<p role="status" className="p-4 text-sm">Loading…</p>}>
              <TraceTablePage />
            </Suspense>
          }
        />
        <Route
          path="truth-tables"
          element={
            <Suspense fallback={<p role="status" className="p-4 text-sm">Loading…</p>}>
              <TruthTablePage />
            </Suspense>
          }
        />
        <Route
          path="number-systems"
          element={
            <Suspense fallback={<p role="status" className="p-4 text-sm">Loading…</p>}>
              <NumberSystemsPage />
            </Suspense>
          }
        />
        <Route
          path="sorting-visualizer"
          element={
            <Suspense fallback={<p role="status" className="p-4 text-sm">Loading…</p>}>
              <SortingPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
