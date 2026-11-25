import { NavLink, Outlet } from 'react-router'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { SITE_NAME } from '../config/site'
import { TOOLS } from './tools'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-accent ${
    isActive ? 'bg-accent-soft text-on-accent-soft' : 'text-text-muted hover:bg-surface-hover hover:text-text'
  }`

/** Sticky top nav + routed page. The shell is the viewport; each page fills the space under the nav. */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col bg-bg text-text print:block print:h-auto print:bg-white! print:text-black!">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface-elevated focus:px-3 focus:py-1.5 focus:text-sm focus:text-text focus:outline-2 focus:outline-accent"
      >
        Skip to content
      </a>
      <nav
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
              <NavLink to={t.path} className={linkClass}>
                {t.name}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </nav>
      <div id="main" tabIndex={-1} className="flex min-h-0 flex-1 flex-col outline-none print:block">
        <Outlet />
      </div>
    </div>
  )
}
