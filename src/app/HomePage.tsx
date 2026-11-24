import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { parseShareHash, SHARE_KEY } from '../core/share/urlState'
import { Badge } from '../components/ui/Badge'
import { BUTTON_CLASSES } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { ToolHeader } from '../components/ui/ToolHeader'
import { BRAND, TOOLS } from './tools'

const linkClass = 'text-emerald-800 underline focus-visible:outline-2 focus-visible:outline-emerald-700 dark:text-emerald-300'

/** Extra home-page copy per tool, keyed by route path. Names and paths come from TOOLS. */
const CARDS: Record<string, { tags: string[]; points: string[]; icon: ReactNode }> = {
  '/trace-table': {
    tags: ['GCSE', 'SQA Higher', 'A-Level', 'CS1'],
    points: ['Run Python and get a line-by-line trace table', 'Exam blanks and a study mode that marks your answers', 'Export to CSV, Markdown, LaTeX, PNG or print'],
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </>
    ),
  },
  '/truth-tables': {
    tags: ['GCSE', 'SQA Higher', 'A-Level', 'CS1'],
    points: ['Type a Boolean expression, get its truth table', 'Logic gates and half/full adders', 'Fill in the table yourself and check it'],
    icon: (
      <>
        <path d="M4 5h8a7 7 0 0 1 0 14H4z" />
        <path d="M12 12h8M1 8h3M1 16h3" />
      </>
    ),
  },
  '/number-systems': {
    tags: ['GCSE', 'SQA Higher', 'A-Level'],
    points: ['Convert between binary, denary and hex', 'Two’s complement and overflow, bit by bit', 'Practice questions with instant marking'],
    icon: (
      <>
        <path d="M7 4v16M17 4v16" />
        <path d="M3 9h18M3 15h18" />
      </>
    ),
  },
  '/sorting-visualizer': {
    tags: ['GCSE', 'SQA Higher', 'A-Level', 'CS1'],
    points: ['Bubble, insertion and merge sort; linear and binary search', 'Pass-by-pass tables you can export', 'Predict the next pass quiz'],
    icon: (
      <>
        <path d="M5 20V12M10 20V5M15 20V9M20 20V15" />
      </>
    ),
  },
}

/** Deep links into the tools. Every one is backed by that tool's sanitised URL parameters. */
export const QUICK_STARTS: readonly { label: string; to: string }[] = [
  { label: 'Trace Bubble Sort in Python', to: '/trace-table?preset=bubble-sort' },
  { label: 'Half-Adder Truth Table', to: '/truth-tables?preset=half-adder' },
  { label: 'Two’s Complement Overflow Check', to: '/number-systems?mode=add&a=01111111&b=00000001' },
  { label: 'Binary Search for 23', to: '/sorting-visualizer?algo=binary&data=3,9,10,23,27,38,43,82&target=23' },
  { label: 'Bubble Sort: predict each pass', to: '/sorting-visualizer?algo=bubble&quiz=1' },
]

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-6 w-6 shrink-0 text-emerald-700 dark:text-emerald-300"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

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
        <section aria-labelledby="hero-heading" className="mb-6 max-w-3xl">
          <h2 id="hero-heading" className="text-2xl font-semibold">
            Computer science revision tools that just work
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            No login, nothing to install. Everything runs in your browser, and your work stays on your device.
          </p>
          <Link to="/trace-table" className={`mt-3 inline-block ${BUTTON_CLASSES.primary}`}>
            Start with a trace table
          </Link>
        </section>
        <section aria-labelledby="quick-heading" className="mb-6">
          <h2 id="quick-heading" className="text-sm font-semibold">
            Quick starts
          </h2>
          <ul aria-label="Quick starts" className="mt-2 flex flex-wrap gap-2">
            {QUICK_STARTS.map((q) => (
              <li key={q.to}>
                <Link to={q.to} className={`inline-block ${BUTTON_CLASSES.toolbar}`}>
                  {q.label}
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <ul aria-label="Tools" className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const card = CARDS[t.path]
            return (
              <li key={t.path}>
                <Panel title={t.name} className="h-full">
                  <div className="flex gap-3 p-3 text-sm">
                    {card && <Icon>{card.icon}</Icon>}
                    <div>
                      <p className="text-slate-700 dark:text-slate-300">{t.blurb}</p>
                      {card && (
                        <>
                          <ul aria-label="Curriculum" className="mt-2 flex flex-wrap gap-2">
                            {card.tags.map((tag) => (
                              <li key={tag}>
                                <Badge>{tag}</Badge>
                              </li>
                            ))}
                          </ul>
                          <ul className="mt-2 list-disc pl-5 text-slate-600 dark:text-slate-400">
                            {card.points.map((p) => (
                              <li key={p}>{p}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      <Link to={t.path} className={`mt-3 inline-block ${linkClass}`}>
                        Open {t.name}
                      </Link>
                    </div>
                  </div>
                </Panel>
              </li>
            )
          })}
        </ul>
      </main>
    </>
  )
}
