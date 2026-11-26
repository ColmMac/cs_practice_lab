import { useLayoutEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigationType } from 'react-router'
import { useSizeVariable, type SizeSource } from '../components/table/useSizeVariable'
import { LINK_CLASSES } from '../components/ui/links'
import { LiveRegion } from '../components/ui/LiveRegion'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { SITE_NAME } from '../config/site'
import { SiteFooter } from './SiteFooter'
import { TOOLS } from './tools'

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `${LINK_CLASSES.nav} ${isActive ? LINK_CLASSES.navActive : LINK_CLASSES.navIdle}`

/** The nav's height (it wraps on narrow screens). Published on <html>: workspaces and scroll padding subtract it. */
const NAV_HEIGHT: SizeSource = { variable: '--nav-h', size: (el) => el.offsetHeight, host: () => document.documentElement }

/**
 * The document scrolls, so a new page must start at its top. Not on back/forward, where the browser puts the old
 * position back, and not when only the query changes (tools write their state to the URL).
 */
function useScrollToTop() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  useLayoutEffect(() => {
    if (type !== 'POP') document.documentElement.scrollTop = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new page resets the position
  }, [pathname])
}

/** Sticky top nav, the routed page, then the footer, in one scrolling document at least as tall as the screen. */
export function AppShell() {
  const navRef = useSizeVariable(NAV_HEIGHT)
  useScrollToTop()
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text print:block print:min-h-0 print:bg-white! print:text-black!">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-elevated focus:px-3 focus:py-1.5 focus:text-sm focus:text-text focus:outline-2 focus:outline-accent"
      >
        Skip to content
      </a>
      <nav
        ref={navRef}
        aria-label="Tools"
        className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-border bg-bg px-4 py-1.5 print:hidden"
      >
        <NavLink
          to="/"
          end
          className="mr-2 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-accent"
        >
          {SITE_NAME}
        </NavLink>
        <ul className="flex flex-wrap items-center gap-1">
          {TOOLS.map((t) => (
            <li key={t.path}>
              <NavLink to={t.path} className={navLinkClass}>
                {t.name}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </nav>
      <div id="main" tabIndex={-1} className="flex flex-1 flex-col focus-visible:-outline-offset-2 print:block">
        <Outlet />
      </div>
      <SiteFooter />
      <LiveRegion />
    </div>
  )
}
