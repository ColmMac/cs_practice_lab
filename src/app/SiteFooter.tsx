import { Coffee } from 'lucide-react'
import { Link } from 'react-router'
import { LINK_CLASSES } from '../components/ui/links'
import { CONTACT_EMAIL, NON_AFFILIATION, REPO_URL, SITE_NAME, SUPPORT_URL } from '../config/site'

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
      <Link to="/accessibility" className={LINK_CLASSES.footer}>
        Accessibility
      </Link>
      <a href={`mailto:${CONTACT_EMAIL}`} className={LINK_CLASSES.footer}>
        Contact
      </a>
      <a href={REPO_URL} className={LINK_CLASSES.footer}>
        GitHub
      </a>
      <a
        href={SUPPORT_URL}
        className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-elevated px-3 py-1 font-medium text-text hover:bg-accent-soft hover:text-on-accent-soft focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Coffee aria-hidden className="size-3.5 text-accent" />
        Buy me a coffee
      </a>
      <span>{NON_AFFILIATION}</span>
      <span className="tabular-nums sm:ml-auto">© {new Date().getFullYear()}</span>
    </footer>
  )
}
