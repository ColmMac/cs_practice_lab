import { Link } from 'react-router'
import { LINK_CLASSES } from '../components/ui/links'
import { CONTACT_EMAIL, REPO_URL, SITE_NAME } from '../config/site'

/** The one <footer> on every page. It sits below the workspace in the scrolling document. */
export function SiteFooter() {
  return (
    <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border bg-surface px-4 py-3 text-xs text-text-muted projector:hidden print:hidden">
      <span className="font-semibold">{SITE_NAME}</span>
      <Link to="/about" className={LINK_CLASSES.footer}>
        About
      </Link>
      <Link to="/privacy" className={LINK_CLASSES.footer}>
        Privacy
      </Link>
      <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASSES.footer}>
        Contact
      </a>
      <a href={REPO_URL} className={LINK_CLASSES.footer}>
        GitHub
      </a>
      <span className="tabular-nums sm:ml-auto">© {new Date().getFullYear()}</span>
    </footer>
  )
}
