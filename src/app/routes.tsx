import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './AppShell'
import { ComingSoonPage, HomePage, NotFoundPage } from './pages'
import { TOOLS } from './tools'

// Each tool is its own chunk, so `/` and the light tools never download CodeMirror or start Pyodide.
const TraceTablePage = lazy(() => import('../App').then((m) => ({ default: m.App })))

const TruthTablePage = lazy(() => import('../components/truth/TruthTablePage').then((m) => ({ default: m.TruthTablePage })))

const NumberSystemsPage = lazy(() =>
  import('../components/numbers/NumberSystemsPage').then((m) => ({ default: m.NumberSystemsPage })),
)

const LIVE = ['/trace-table', '/truth-tables', '/number-systems']
const COMING_SOON = TOOLS.filter((t) => !LIVE.includes(t.path))

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
        {COMING_SOON.map((t) => (
          <Route key={t.path} path={t.path.slice(1)} element={<ComingSoonPage name={t.name} />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
