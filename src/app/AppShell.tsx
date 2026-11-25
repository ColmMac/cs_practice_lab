import { NavLink, Outlet } from 'react-router'
import { ThemeToggle } from '../components/ui/ThemeToggle'
import { BRAND, TOOLS } from './tools'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2 py-1 text-sm font-medium hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-700 dark:hover:bg-slate-800 ${
    isActive ? 'bg-slate-200 text-emerald-800 dark:bg-slate-800 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'
  }`

/** Sticky top nav + routed page. The shell is the viewport; each page fills the space under the nav. */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100 print:block print:h-auto print:bg-white! print:text-black!">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-1.5 focus:text-sm focus:text-slate-900 focus:outline-2 focus:outline-emerald-700 dark:focus:bg-slate-900 dark:focus:text-slate-100"
      >
        Skip to content
      </a>
      <nav
        aria-label="Tools"
        className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-slate-300 bg-white px-4 py-1.5 print:hidden dark:border-slate-700 dark:bg-slate-950"
      >
        <NavLink
          to="/"
          end
          className="mr-2 rounded text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700"
        >
          {BRAND}
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
