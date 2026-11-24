import { Link } from 'react-router'
import { ToolHeader } from '../components/ui/ToolHeader'
import { PageMeta } from './PageMeta'

const linkClass = 'text-emerald-800 underline focus-visible:outline-2 focus-visible:outline-emerald-700 dark:text-emerald-300'

export function NotFoundPage() {
  return (
    <>
      <PageMeta title="Page not found" description="That page doesn’t exist." noindex />
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
