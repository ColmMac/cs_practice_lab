import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { privacyDoc } from '../../src/app/info/content'
import { jsonLdText, pageHead } from '../../src/app/seo'
import { renderShell, shellFileName, shellPages } from '../../src/app/staticShell'
import { SITE_PATHS } from '../../src/app/tools'
import { DIALECT_KEY } from '../../src/components/editor/PseudocodePanel'
import { LAST_KEY } from '../../src/components/truth/useTruthPage'
import { PROJECTOR_KEY } from '../../src/components/ui/projector'
import { THEME_KEY } from '../../src/components/ui/theme'
import { MASTERY_KEY } from '../../src/core/mastery/types'
import { isAdsenseClient } from '../../src/config/site'
import { STORAGE_KEY } from '../../src/store/persistence'

const SITE = 'https://cspracticelab.com'
// the source index.html stands in for the built one: the anchors the generator needs are the same
const template = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const shells = shellPages(false).map((page) => ({ page, html: renderShell(template, page, SITE) }))

describe('static route shells', () => {
  it('there is one per indexable route, named so the host serves it without .html', () => {
    expect(shells.map((s) => s.page.path)).toEqual(SITE_PATHS)
    expect(shellFileName('/')).toBe('index.html')
    expect(shellFileName('/trace-table')).toBe('trace-table.html')
  })

  it.each(shells.map((s) => [s.page.path, s] as const))('%s has one of each head tag and valid JSON-LD', (path, { html }) => {
    const doc = parse(html)
    const url = `${SITE}${path}`
    expect(doc.querySelectorAll('title')).toHaveLength(1)
    for (const selector of ['meta[name="description"]', 'link[rel="canonical"]', 'meta[property="og:url"]']) {
      expect(doc.head.querySelectorAll(selector), selector).toHaveLength(1)
    }
    expect(doc.querySelector('link[rel="canonical"]')!.getAttribute('href')).toBe(url)
    expect(doc.querySelector('meta[property="og:url"]')!.getAttribute('content')).toBe(url)
    expect(doc.querySelector('meta[property="og:image"]')!.getAttribute('content')).toBe(`${SITE}/og-image.png`)

    const blocks = [...doc.head.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!))
    expect(blocks[0]).toMatchObject({ '@type': 'WebSite', '@id': `${SITE}/#website`, name: 'CS Practice Lab', url: `${SITE}/` })
    // everything we injected is marked, so main.tsx can remove it before React renders its own
    for (const el of doc.head.querySelectorAll('meta[property], meta[name="description"], meta[name="twitter:card"], link[rel="canonical"], script[type="application/ld+json"]')) {
      expect(el.hasAttribute('data-default'), el.outerHTML).toBe(true)
    }
    expect(html).toMatch(/<noscript>\s*<h1>[^<]+<\/h1>/)
  })

  it('titles and descriptions are unique', () => {
    const docs = shells.map((s) => parse(s.html))
    expect(new Set(docs.map((d) => d.title)).size).toBe(shells.length)
    expect(new Set(docs.map((d) => d.querySelector('meta[name="description"]')!.getAttribute('content'))).size).toBe(shells.length)
  })

  it('only tool pages describe a free web application', () => {
    for (const { page, html } of shells) {
      const apps = [...parse(html).querySelectorAll('script[type="application/ld+json"]')]
        .map((s) => JSON.parse(s.textContent!))
        .filter((b) => b['@type'] === 'WebApplication')
      const isTool = !['/', '/about', '/privacy', '/accessibility'].includes(page.path)
      expect(apps, page.path).toHaveLength(isTool ? 1 : 0)
      if (!isTool) continue
      expect(apps[0]).toMatchObject({
        '@id': `${SITE}${page.path}#app`,
        url: `${SITE}${page.path}`,
        name: page.title,
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any',
        isAccessibleForFree: true,
        offers: { price: 0, priceCurrency: 'GBP' },
        isPartOf: { '@id': `${SITE}/#website` },
      })
    }
  })

  it('the about and privacy shells carry the page text for readers without JavaScript', () => {
    const body = (path: string) => shells.find((s) => s.page.path === path)!.html.match(/<noscript>([\s\S]*)<\/noscript>/)![1]!
    expect(body('/about')).toContain('href="mailto:contact@cspracticelab.com"')
    expect(body('/about')).toContain('href="https://github.com/ColmMac/cs_practice_lab"')
    expect(body('/privacy')).toContain('Information Commissioner’s Office')
    expect(body('/privacy')).toContain('hub:mastery:v1')
    expect(body('/accessibility')).toContain('href="mailto:contact@cspracticelab.com"')
    expect(body('/accessibility')).toContain('Last reviewed: ')
  })

  it('uses the origin it is given', () => {
    const html = renderShell(template, shellPages(false)[1]!, 'https://example.com')
    expect(html).not.toContain('cspracticelab.com/trace-table')
    expect(html).toContain('href="https://example.com/trace-table"')
  })

  it('fails rather than ship an unpatched page', () => {
    expect(() => renderShell('<html><head></head><body></body></html>', shellPages(false)[0]!, SITE)).toThrow(/no match/)
  })
})

describe('structured data', () => {
  const input = { title: 'Truth tables', description: 'd', pathname: '/truth-tables', siteUrl: SITE }

  it('has no FAQPage without questions', () => {
    expect(pageHead(input).jsonLd.map((b) => b['@type'])).toEqual(['WebSite', 'WebApplication'])
  })

  it('builds the FAQPage from the questions it is given', () => {
    const faq = [{ question: 'Is it free?', answer: 'Yes.' }]
    expect(pageHead({ ...input, faq }).jsonLd[2]).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: [{ '@type': 'Question', name: 'Is it free?', acceptedAnswer: { '@type': 'Answer', text: 'Yes.' } }],
    })
  })

  it('can’t be closed early by its own text', () => {
    const text = jsonLdText({ name: '</script><script>alert(1)</script>' })
    expect(text).not.toContain('<')
    expect(JSON.parse(text)).toEqual({ name: '</script><script>alert(1)</script>' })
  })
})

describe('privacy text', () => {
  const text = (ads: boolean) => JSON.stringify(privacyDoc(ads))

  it('names every browser storage key', () => {
    for (const key of [STORAGE_KEY, THEME_KEY, 'tts:welcomed', PROJECTOR_KEY, DIALECT_KEY, MASTERY_KEY, LAST_KEY]) {
      expect(text(false)).toContain(`${key}:`)
    }
  })

  it('only claims there are no cookies in a build without adverts', () => {
    expect(text(false)).toContain('We set no cookies.')
    expect(text(true)).not.toContain('no cookies')
    expect(text(true)).toContain('need your consent')
  })

  it('never says there is no personal data without saying who receives the IP address', () => {
    for (const ads of [false, true]) {
      expect(text(ads)).toContain('your IP address counts as personal data')
      expect(text(ads)).not.toMatch(/zero personal data|\bDPA\b|data processing agreement/i)
    }
  })

  it('only says adverts are running in a build that has an AdSense publisher ID', () => {
    expect(text(false)).toContain('Adverts are not switched on yet')
    expect(text(true)).not.toContain('Adverts are not switched on yet')
    expect(isAdsenseClient('ca-pub-0123456789012345')).toBe(true)
    for (const raw of [undefined, '', 'ca-pub-123', 'pub-0123456789012345']) expect(isAdsenseClient(raw)).toBe(false)
  })
})
