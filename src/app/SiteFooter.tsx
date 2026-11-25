import { Link } from 'react-router'
import { CONTACT_EMAIL, REPO_URL, SITE_NAME } from '../config/site'

const linkClass = 'rounded underline hover:text-text focus-visible:outline-2 focus-visible:outline-accent'

/** The one <footer> on every page. It sits below the workspace in the scrolling document. */
export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface px-4 py-3 text-xs text-text-muted projector:hidden print:hidden">
      <span className="font-semibold">{SITE_NAME}</span>
      <Link to="/about" className={linkClass}>
        About
      </Link>
      <Link to="/privacy" className={linkClass}>
        Privacy
      </Link>
      <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
        Contact
      </a>
      <a href={REPO_URL} className={linkClass}>
        GitHub
      </a>
      <span className="tabular-nums sm:ml-auto">© {new Date().getFullYear()}</span>
    </footer>
  )
}
