import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PageMeta } from '../../src/app/PageMeta'
import { SITE_PATHS, TOOLS } from '../../src/app/tools'
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

  it('the sitemap covers the home page and the four tools, each tool with a description', () => {
    expect(SITE_PATHS).toEqual(['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer'])
    for (const t of TOOLS) expect(t.description.length).toBeGreaterThan(40)
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

  it('a noindex page has no canonical', () => {
    const view = render(
      <MemoryRouter initialEntries={['/nope']}>
        <PageMeta title="Page not found" description="d" noindex />
      </MemoryRouter>,
    )
    expect(canonical()).toBeUndefined()
    view.unmount()
  })
})
