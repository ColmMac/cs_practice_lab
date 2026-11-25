import { Link } from 'react-router'
import { AdSlot } from '../components/ui/AdSlot'
import { useAdsAllowed } from '../components/ui/useAdsAllowed'
import { ToolHeader } from '../components/ui/ToolHeader'
import { CookieChoicesButton } from './CookieChoicesButton'
import type { Block, InfoDoc, Inline } from './info/content'
import { PageMeta } from './PageMeta'
import { infoPage } from './tools'

const linkClass = 'text-accent underline focus-visible:outline-2 focus-visible:outline-accent'

function Text({ parts }: { parts: Inline[] }) {
  return parts.map((part, i) => {
    if (typeof part === 'string') return part
    return part.href.startsWith('/') ? (
      <Link key={i} to={part.href} className={linkClass}>
        {part.text}
      </Link>
    ) : (
      <a key={i} href={part.href} className={linkClass}>
        {part.text}
      </a>
    )
  })
}

function BlockView({ block }: { block: Block }) {
  if ('p' in block) {
    return (
      <p>
        <Text parts={block.p} />
      </p>
    )
  }
  return (
    <ul className="list-disc space-y-1 pl-5">
      {block.ul.map((item, i) => (
        <li key={i} className="break-words">
          <Text parts={item} />
        </li>
      ))}
    </ul>
  )
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })

/** A page of plain prose: /about and /privacy. */
export function InfoPage({ path, doc }: { path: '/about' | '/privacy'; doc: InfoDoc }) {
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
              Last updated: <time dateTime={doc.updated}>{longDate(doc.updated)}</time>
            </p>
          )}
        </div>
        <AdSlot ads={ads} className="mt-6 max-w-prose" />
      </main>
    </>
  )
}
