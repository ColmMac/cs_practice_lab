import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PageMeta } from '../../src/app/PageMeta'
import { INFO_PAGES, SITE_PATHS, TOOLS } from '../../src/app/tools'
import { normaliseOrigin, resolveSiteUrl, SITE_DESCRIPTION, SITE_NAME } from '../../src/config/site'

const canonical = () => document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')

describe('seo', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('normalises the site origin', () => {
    expect(normaliseOrigin('https://example.com/')).toBe('https://example.com')
    expect(normaliseOrigin('  https://example.com//  ')).toBe('https://example.com')
    expect(normaliseOrigin('')).toBe('')
    expect(normaliseOrigin(undefined)).toBe('')
  })

  it('falls back to the production origin when VITE_SITE_URL has no value', () => {
    for (const raw of [undefined, '', '   ', '/']) expect(resolveSiteUrl(raw)).toBe('https://cspracticelab.com')
    expect(resolveSiteUrl('https://example.com/')).toBe('https://example.com')
  })

  it('the sitemap covers the home page, the four tools and the three info pages, each with a description', () => {
    expect(SITE_PATHS).toEqual(['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer', '/about', '/privacy', '/accessibility'])
    expect(TOOLS).toHaveLength(4) // the info pages stay out of the nav and the home directory
    for (const p of [...TOOLS, ...INFO_PAGES]) expect(p.description.length).toBeGreaterThan(40)
  })

  it('index.html repeats the site name and description from site.ts', () => {
    const doc = new DOMParser().parseFromString(readFileSync(resolve(process.cwd(), 'index.html'), 'utf8'), 'text/html')
    expect(doc.title).toBe(SITE_NAME)
    expect(doc.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(SITE_DESCRIPTION)
  })

  it.each([
    ['/', 'https://cspracticelab.com/'],
    ['/truth-tables/?x=1#y', 'https://cspracticelab.com/truth-tables'],
  ])('PageMeta gives %s a canonical link on the default origin', (entry, href) => {
    const view = render(
      <MemoryRouter initialEntries={[entry]}>
        <PageMeta description="d" />
      </MemoryRouter>,
    )
    expect(canonical()).toBe(href)
    view.unmount()
  })

  it('PageMeta takes the canonical origin from VITE_SITE_URL', async () => {
    vi.stubEnv('VITE_SITE_URL', 'https://example.com/')
    vi.resetModules()
    // fresh copies of React and the router too, so they all share one instance
    const [{ PageMeta: Meta }, router, rtl] = await Promise.all([
      import('../../src/app/PageMeta'),
      import('react-router'),
      import('@testing-library/react'),
    ])
    const view = rtl.render(
      <router.MemoryRouter initialEntries={['/truth-tables']}>
        <Meta title="Truth tables" description="d" />
      </router.MemoryRouter>,
    )
    expect(canonical()).toBe('https://example.com/truth-tables')
    view.unmount()
  })

  it('PageMeta gives a tool page its social tags and structured data', () => {
    const view = render(
      <MemoryRouter initialEntries={['/truth-tables']}>
        <PageMeta title="Truth tables" description="d" />
      </MemoryRouter>,
    )
    const og = (name: string) => document.head.querySelector(`meta[property="og:${name}"]`)?.getAttribute('content')
    expect(og('url')).toBe('https://cspracticelab.com/truth-tables')
    expect(og('title')).toBe('Truth tables · CS Practice Lab')
    expect(og('image')).toBe('https://cspracticelab.com/og-image.png')
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
    const blocks = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => JSON.parse(s.textContent!))
    expect(blocks.map((b) => b['@type'])).toEqual(['WebSite', 'WebApplication'])
    view.unmount()
  })

  it('a noindex page has no canonical, social tags or structured data', () => {
    const view = render(
      <MemoryRouter initialEntries={['/nope']}>
        <PageMeta title="Page not found" description="d" noindex />
      </MemoryRouter>,
    )
    expect(canonical()).toBeUndefined()
    expect(document.querySelector('meta[property^="og:"], script[type="application/ld+json"]')).toBeNull()
    view.unmount()
  })
})
