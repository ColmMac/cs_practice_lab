import { Link } from 'react-router'
import { ToolHeader } from '../components/ui/ToolHeader'
import { PageMeta } from './PageMeta'

const linkClass = 'text-accent underline focus-visible:outline-2 focus-visible:outline-accent'

export function NotFoundPage() {
  return (
    <>
      <PageMeta title="Page not found" description="That page doesn’t exist." noindex />
      <ToolHeader title="Page not found" />
      <main className="p-4">
        <p className="text-sm text-text-muted">That page doesn’t exist.</p>
        <p className="mt-2 text-sm">
          <Link to="/" className={linkClass}>Go to the home page</Link>
        </p>
      </main>
    </>
  )
}
