import { AdSlot } from '../components/ui/AdSlot'
import { useAdsAllowed } from '../components/ui/useAdsAllowed'
import { ToolHeader } from '../components/ui/ToolHeader'
import { CookieChoicesButton } from './CookieChoicesButton'
import type { InfoDoc } from './info/content'
import { PageMeta } from './PageMeta'
import { BlockView, Text } from './Prose'
import { infoPage, type InfoPath } from './tools'

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** A page of plain prose: /about, /privacy and /accessibility. */
export function InfoPage({ path, doc }: { path: InfoPath; doc: InfoDoc }) {
  const page = infoPage(path)
  const ads = useAdsAllowed(path === '/privacy') // never on the privacy page
  return (
    <>
      <PageMeta title={page.name} description={page.description} />
      <ToolHeader title={page.name} />
      <main className="flex-1 p-4">
        <div className="max-w-prose space-y-3 text-sm leading-relaxed">
          <p>
            <Text parts={doc.intro} />
          </p>
          {doc.sections.map((s) => (
            <section key={s.heading} className="space-y-3 pt-2">
              <h2 className="text-base font-semibold">{s.heading}</h2>
              {s.blocks.map((b, i) => (
                <BlockView key={i} block={b} />
              ))}
              {s.cookieChoices && <CookieChoicesButton />}
            </section>
          ))}
          {doc.updated && (
            <p className="pt-2 text-xs tabular-nums text-text-muted">
              {doc.updatedLabel ?? 'Last updated'}: <time dateTime={doc.updated}>{longDate(doc.updated)}</time>
            </p>
          )}
        </div>
        {path !== '/accessibility' && <AdSlot ads={ads} className="mt-6 max-w-prose" />}
      </main>
    </>
  )
}
