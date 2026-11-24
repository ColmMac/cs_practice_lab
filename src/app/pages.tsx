import { Link, Navigate, useLocation } from 'react-router'
import { parseShareHash, SHARE_KEY } from '../core/share/urlState'
import { Panel } from '../components/ui/Panel'
import { ToolHeader } from '../components/ui/ToolHeader'
import { BRAND, TOOLS } from './tools'

const linkClass = 'text-emerald-800 underline focus-visible:outline-2 focus-visible:outline-emerald-700 dark:text-emerald-300'

/** Placeholder directory; the real home page comes later. */
export function HomePage() {
  const { hash } = useLocation()
  // Old share links lived at `/#s=…`. Forward them before anything renders; the trace page still never auto-runs them.
  const payload = parseShareHash(hash)
  if (payload) return <Navigate to={`/trace-table#${SHARE_KEY}${payload}`} replace />
  return (
    <>
      <title>{BRAND}</title>
      <ToolHeader title={BRAND} />
      <main className="min-h-0 flex-1 overflow-auto p-4">
        <ul className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <li key={t.path}>
              <Panel title={t.name}>
                <div className="p-3 text-sm">
                  <p className="text-slate-700 dark:text-slate-300">{t.blurb}</p>
                  <Link to={t.path} className={`mt-2 inline-block ${linkClass}`}>
                    Open {t.name}
                  </Link>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      </main>
    </>
  )
}

export function ComingSoonPage({ name }: { name: string }) {
  return (
    <>
      <title>{`${name} · ${BRAND}`}</title>
      <meta name="robots" content="noindex" />
      <ToolHeader title={name} />
      <main className="p-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">Coming soon.</p>
        <p className="mt-2 text-sm">
          <Link to="/" className={linkClass}>Back to all tools</Link>
        </p>
      </main>
    </>
  )
}

export function NotFoundPage() {
  return (
    <>
      <title>{`Page not found · ${BRAND}`}</title>
      <meta name="robots" content="noindex" />
      <ToolHeader title="Page not found" />
      <main className="p-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">That page doesn’t exist.</p>
        <p className="mt-2 text-sm">
          <Link to="/" className={linkClass}>Go to the home page</Link>
        </p>
      </main>
    </>
  )
}
