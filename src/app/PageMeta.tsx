import { useLocation } from 'react-router'
import { SITE_URL } from '../config/site'
import { jsonLdText, pageHead, pageTitle, type Faq } from './seo'

interface Props {
  /** The page's own name; the home page passes none and gets the bare brand. */
  title?: string
  description: string
  /** The questions the page shows. Pass the same array the visible FAQ renders from. */
  faq?: readonly Faq[]
  /** No canonical, social tags or structured data. */
  noindex?: boolean
}

/**
 * Per-route head tags. React 19 hoists the title, metas and canonical into `<head>`. It doesn't hoist JSON-LD, so
 * those data blocks stay in the body, which search engines also read.
 */
export function PageMeta({ title, description, faq, noindex }: Props) {
  const { pathname } = useLocation()
  if (noindex) {
    return (
      <>
        <title>{pageTitle(title)}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="noindex" />
      </>
    )
  }
  const head = pageHead({ title, description, pathname, siteUrl: SITE_URL, faq })
  return (
    <>
      <title>{head.title}</title>
      <meta name="description" content={head.description} />
      <link rel="canonical" href={head.canonical} />
      {head.social.map((m) => (
        <meta key={m.key} {...{ [m.attr]: m.key }} content={m.content} />
      ))}
      {head.jsonLd.map((block) => (
        <script
          key={String(block['@type'])}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdText(block) }}
        />
      ))}
    </>
  )
}
