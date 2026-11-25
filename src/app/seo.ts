/**
 * What goes in a page's <head>, as plain data. `PageMeta` renders it in the app and `staticShell.ts` writes it into
 * each route's HTML at build time, so the two are the same by construction. Imported by Node: no React.
 */
import { SITE_NAME } from '../config/site.ts'
import { TOOLS } from './tools.ts'

/** One question and answer, exactly as the page shows them. */
export interface Faq {
  question: string
  answer: string
}

export interface PageInput {
  /** The page's own name. The home page has none and gets the bare brand. */
  title?: string
  description: string
  pathname: string
  /** The origin everything absolute is built on, without a trailing slash. */
  siteUrl: string
  faq?: readonly Faq[]
}

export interface MetaTag {
  attr: 'name' | 'property'
  key: string
  content: string
}

export interface PageHead {
  title: string
  description: string
  canonical: string
  /** Open Graph and Twitter card tags. */
  social: MetaTag[]
  /** schema.org blocks, one per <script>. */
  jsonLd: Record<string, unknown>[]
}

export const OG_IMAGE_PATH = '/og-image.png'

export const pageTitle = (name?: string): string => (name ? `${name} · ${SITE_NAME}` : SITE_NAME)

/** The route without query, hash or trailing slash (except '/'). */
export const canonicalPath = (pathname: string): string => pathname.replace(/\/+$/, '') || '/'

const context = 'https://schema.org'

function structuredData({ pathname, siteUrl, description, faq }: PageInput, canonical: string): PageHead['jsonLd'] {
  const websiteId = `${siteUrl}/#website`
  const blocks: PageHead['jsonLd'] = [
    { '@context': context, '@type': 'WebSite', '@id': websiteId, name: SITE_NAME, url: `${siteUrl}/` },
  ]
  const tool = TOOLS.find((t) => t.path === canonicalPath(pathname))
  if (!tool) return blocks
  blocks.push({
    '@context': context,
    '@type': 'WebApplication',
    '@id': `${canonical}#app`,
    name: tool.name,
    description,
    url: canonical,
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Any',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: 0, priceCurrency: 'GBP' },
    isPartOf: { '@id': websiteId },
  })
  if (faq?.length) {
    blocks.push({
      '@context': context,
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: faq.map((f) => ({
        '@type': 'Question',
        name: f.question,
        acceptedAnswer: { '@type': 'Answer', text: f.answer },
      })),
    })
  }
  return blocks
}

export function pageHead(input: PageInput): PageHead {
  const title = pageTitle(input.title)
  const canonical = `${input.siteUrl}${canonicalPath(input.pathname)}`
  const og = (key: string, content: string): MetaTag => ({ attr: 'property', key, content })
  return {
    title,
    description: input.description,
    canonical,
    social: [
      og('og:type', 'website'),
      og('og:url', canonical),
      og('og:title', title),
      og('og:description', input.description),
      og('og:site_name', SITE_NAME),
      og('og:image', `${input.siteUrl}${OG_IMAGE_PATH}`),
      { attr: 'name', key: 'twitter:card', content: 'summary_large_image' },
    ],
    jsonLd: structuredData(input, canonical),
  }
}

/** JSON for the inside of a <script> element: no `<` can end it early. */
export const jsonLdText = (block: Record<string, unknown>): string => JSON.stringify(block).replaceAll('<', '\\u003c')
