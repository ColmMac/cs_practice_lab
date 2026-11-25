import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AppShell } from './AppShell'
import { HomePage } from './HomePage'
import { NotFoundPage } from './pages'

// Each tool is its own chunk, so `/` and the light tools never download CodeMirror or start Pyodide.
const TraceTablePage = lazy(() => import('./TraceTableRoute').then((m) => ({ default: m.TraceTableRoute })))

const TruthTablePage = lazy(() => import('../components/truth/TruthTablePage').then((m) => ({ default: m.TruthTablePage })))

const SortingPage = lazy(() => import('../components/sorting/SortingPage').then((m) => ({ default: m.SortingPage })))

const NumberSystemsPage = lazy(() =>
  import('../components/numbers/NumberSystemsPage').then((m) => ({ default: m.NumberSystemsPage })),
)

const AboutPage = lazy(() => import('./AboutPage').then((m) => ({ default: m.AboutPage })))

const PrivacyPage = lazy(() => import('./PrivacyPage').then((m) => ({ default: m.PrivacyPage })))

const loading = (
  <p role="status" className="p-4 text-sm">
    Loading…
  </p>
)

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<HomePage />} />
        <Route
          path="trace-table"
          element={
            <Suspense fallback={loading}>
              <TraceTablePage />
            </Suspense>
          }
        />
        <Route
          path="truth-tables"
          element={
            <Suspense fallback={loading}>
              <TruthTablePage />
            </Suspense>
          }
        />
        <Route
          path="number-systems"
          element={
            <Suspense fallback={loading}>
              <NumberSystemsPage />
            </Suspense>
          }
        />
        <Route
          path="sorting-visualizer"
          element={
            <Suspense fallback={loading}>
              <SortingPage />
            </Suspense>
          }
        />
        <Route
          path="about"
          element={
            <Suspense fallback={loading}>
              <AboutPage />
            </Suspense>
          }
        />
        <Route
          path="privacy"
          element={
            <Suspense fallback={loading}>
              <PrivacyPage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
