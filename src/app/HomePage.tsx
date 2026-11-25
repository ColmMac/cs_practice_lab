import { Binary, ChartColumn, Table, ToggleLeft, type LucideIcon } from 'lucide-react'
import { Link, Navigate, useLocation } from 'react-router'
import { parseShareHash, SHARE_KEY } from '../core/share/urlState'
import { AdSlot } from '../components/ui/AdSlot'
import { useAdsAllowed } from '../components/ui/useAdsAllowed'
import { LINK_CLASSES } from '../components/ui/links'
import { Badge } from '../components/ui/Badge'
import { BUTTON_CLASSES } from '../components/ui/Button'
import { Panel } from '../components/ui/Panel'
import { ToolHeader } from '../components/ui/ToolHeader'
import { MasteryStrip } from './MasteryStrip'
import { PageMeta } from './PageMeta'
import { SITE_DESCRIPTION, SITE_NAME } from '../config/site'
import { TOOLS } from './tools'
import { TRACE_PRESET_IDS, useMastery } from './useMastery'
import { presetProgress } from '../core/mastery/mastery'

/** Extra home-page detail per tool, keyed by route path. Names, summaries and paths come from TOOLS. */
const CARDS: Record<string, { tags: string[]; Icon: LucideIcon }> = {
  '/trace-table': { tags: ['GCSE', 'SQA Higher', 'A-Level', 'CS1'], Icon: Table },
  '/truth-tables': { tags: ['GCSE', 'A-Level', 'CS1'], Icon: ToggleLeft },
  '/number-systems': { tags: ['GCSE', 'SQA Higher', 'A-Level'], Icon: Binary },
  '/sorting-visualizer': { tags: ['GCSE', 'SQA Higher', 'A-Level', 'CS1'], Icon: ChartColumn },
}

/** Deep links into the tools. Every one is backed by that tool's sanitised URL parameters. */
export const QUICK_STARTS: readonly { label: string; to: string }[] = [
  { label: 'Trace Bubble Sort in Python', to: '/trace-table?preset=bubble-sort' },
  { label: 'Half-Adder Truth Table', to: '/truth-tables?preset=half-adder' },
  { label: 'Two’s Complement Overflow Check', to: '/number-systems?mode=add&a=01111111&b=00000001' },
  { label: 'Binary Search for 23', to: '/sorting-visualizer?algo=binary&data=3,9,10,23,27,38,43,82&target=23' },
  { label: 'Bubble Sort: predict each pass', to: '/sorting-visualizer?algo=bubble&quiz=1' },
]

/** "2/6 mastered" on the trace card, once there is something to say. */
function TraceMasteryBadge() {
  const { mastered, practised, total } = presetProgress(useMastery(), 'trace', TRACE_PRESET_IDS)
  if (practised === 0) return null
  return (
    <p className="mt-2">
      <Badge tone={mastered === total ? 'ok' : 'info'}>
        {mastered}/{total} mastered
      </Badge>
    </p>
  )
}

export function HomePage() {
  const { hash } = useLocation()
  const ads = useAdsAllowed(false)
  // Old share links lived at `/#s=…`. Forward them before anything renders; the trace page still never auto-runs them.
  const payload = parseShareHash(hash)
  if (payload) return <Navigate to={`/trace-table#${SHARE_KEY}${payload}`} replace />
  return (
    <>
      <PageMeta description={SITE_DESCRIPTION} />
      <ToolHeader title={SITE_NAME} />
      <main className="flex-1 p-4">
        <section aria-labelledby="hero-heading" className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="hero-heading" className="text-xl font-semibold">
              Practice tools for school and university computer science
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              No login, nothing to install. Everything runs in your browser, and your work stays on your device.
            </p>
          </div>
          <Link to="/trace-table" className={`inline-block ${BUTTON_CLASSES.primary}`}>
            Start with a trace table
          </Link>
        </section>
        <ul aria-label="Tools" className="grid gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => {
            const card = CARDS[t.path]
            return (
              <li key={t.path}>
                <Panel title={t.name} className="h-full">
                  <div className="flex gap-3 p-3 text-sm">
                    {card && <card.Icon aria-hidden="true" className="size-6 shrink-0 text-accent" strokeWidth={1.75} />}
                    <div>
                      <p>{t.blurb}</p>
                      {t.path === '/trace-table' && <TraceMasteryBadge />}
                      {card && (
                        <ul aria-label="Curriculum" className="mt-2 flex flex-wrap gap-2">
                          {card.tags.map((tag) => (
                            <li key={tag}>
                              <Badge>{tag}</Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                      <Link to={t.path} className={`mt-3 inline-block ${LINK_CLASSES.inline}`}>
                        Open {t.name}
                      </Link>
                    </div>
                  </div>
                </Panel>
              </li>
            )
          })}
        </ul>
        <AdSlot ads={ads} className="mt-6" />
        <section aria-labelledby="quick-heading" className="mt-6">
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
        <MasteryStrip />
      </main>
    </>
  )
}
