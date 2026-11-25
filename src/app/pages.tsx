import { Link } from 'react-router'
import { ToolHeader } from '../components/ui/ToolHeader'
import { LINK_CLASSES } from '../components/ui/links'
import { PageMeta } from './PageMeta'

export function NotFoundPage() {
  return (
    <>
      <PageMeta title="Page not found" description="That page doesn’t exist." noindex />
      <ToolHeader title="Page not found" />
      <main className="p-4">
        <p className="text-sm text-text-muted">That page doesn’t exist.</p>
        <p className="mt-2 text-sm">
          <Link to="/" className={LINK_CLASSES.inline}>Go to the home page</Link>
        </p>
      </main>
    </>
  )
}
