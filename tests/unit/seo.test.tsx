import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { siteUrl } from '../../src/app/PageMeta'
import { SITE_PATHS, TOOLS } from '../../src/app/tools'

describe('seo', () => {
  it('normalises the site origin', () => {
    expect(siteUrl('https://example.com/')).toBe('https://example.com')
    expect(siteUrl('  https://example.com//  ')).toBe('https://example.com')
    expect(siteUrl('')).toBe('')
    expect(siteUrl(undefined)).toBe('')
  })

  it('the sitemap covers the home page and the four tools, each tool with a description', () => {
    expect(SITE_PATHS).toEqual(['/', '/trace-table', '/truth-tables', '/number-systems', '/sorting-visualizer'])
    for (const t of TOOLS) expect(t.description.length).toBeGreaterThan(40)
  })

  it('PageMeta renders a canonical link from the site origin', async () => {
    vi.stubEnv('VITE_SITE_URL', 'https://example.com/')
    const { PageMeta } = await import('../../src/app/PageMeta')
    render(
      <MemoryRouter initialEntries={['/truth-tables?x=1']}>
        <PageMeta title="Truth tables" description="d" />
      </MemoryRouter>,
    )
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://example.com/truth-tables')
    vi.unstubAllEnvs()
  })
})
