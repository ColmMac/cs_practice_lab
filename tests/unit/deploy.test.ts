import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8')

/** `_headers` as the host reads it: path patterns in column 0, their headers indented, `#` lines ignored. */
function headerBlocks(): Map<string, Map<string, string>> {
  const blocks = new Map<string, Map<string, string>>()
  let block: Map<string, string> | undefined
  for (const line of read('_headers').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    if (/^\S/.test(line)) blocks.set(line.trim(), (block = new Map()))
    else {
      const at = line.indexOf(':')
      block!.set(line.slice(0, at).trim(), line.slice(at + 1).trim())
    }
  }
  return blocks
}

const site = () => headerBlocks().get('/*')!

/** One CSP directive's sources. */
function csp(directive: string): string[] {
  const parts = site().get('Content-Security-Policy')!.split(';').map((d) => d.trim().split(/\s+/))
  const found = parts.filter(([name]) => name === directive)
  expect(found, `exactly one ${directive}`).toHaveLength(1)
  return found[0]!.slice(1)
}

describe('static hosting config', () => {
  it('_redirects is a single well-formed SPA fallback rule', () => {
    const rules = read('_redirects').split(/\r?\n/).filter((l) => l.trim() && !l.startsWith('#'))
    expect(rules).toHaveLength(1)
    expect(rules[0]!.trim().split(/\s+/)).toEqual(['/*', '/index.html', '200'])
  })

  it('_headers starts with its /* block, which has the CSP', () => {
    expect(read('_headers').split(/\r?\n/)[0]!.trim()).toBe('/*')
    expect([...headerBlocks().keys()]).toEqual(['/*', '/assets/*', '/index.html', '/*.html'])
    expect(site().has('Content-Security-Policy')).toBe(true)
  })

  it('sends nothing that would block ads: no COEP, popups allowed, the origin as referrer', () => {
    for (const block of headerBlocks().values()) expect(block.has('Cross-Origin-Embedder-Policy')).toBe(false)
    expect(site().get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups')
    expect(site().get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
  })

  it('the CSP allows the AdSense and consent-message hosts', () => {
    expect(csp('script-src')).toEqual(
      expect.arrayContaining([
        'https://pagead2.googlesyndication.com',
        'https://*.googlesyndication.com',
        'https://*.doubleclick.net',
        'https://*.google',
        'https://*.adtrafficquality.google',
        'https://fundingchoicesmessages.google.com',
        'https://www.googletagservices.com',
      ]),
    )
    expect(csp('frame-src')).toEqual(
      expect.arrayContaining([
        'https://*.googlesyndication.com',
        'https://*.doubleclick.net',
        'https://fundingchoicesmessages.google.com',
        'https://www.google.com',
      ]),
    )
    expect(csp('img-src')).toContain('https:')
    expect(csp('connect-src')).toEqual(
      expect.arrayContaining([
        'https://pagead2.googlesyndication.com',
        'https://*.googlesyndication.com',
        'https://*.adtrafficquality.google',
        'https://*.google',
      ]),
    )
  })

  it('the CSP keeps its locks: no eval, no inline scripts, no framing, no form posts', () => {
    const scripts = csp('script-src')
    expect(scripts).toEqual(expect.arrayContaining(["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net']))
    for (const unsafe of ["'unsafe-eval'", "'unsafe-inline'", 'https:', 'data:', '*']) {
      expect(scripts).not.toContain(unsafe)
    }
    expect(csp('default-src')).toEqual(["'self'"])
    for (const directive of ['object-src', 'base-uri', 'form-action', 'frame-ancestors']) {
      expect(csp(directive)).toEqual(["'none'"])
    }
  })

  it('caches hashed assets for a year and revalidates the HTML', () => {
    const blocks = headerBlocks()
    expect(blocks.get('/assets/*')!.get('Cache-Control')).toBe('public, max-age=31536000, immutable')
    for (const path of ['/index.html', '/*.html']) expect(blocks.get(path)!.get('Cache-Control')).toBe('no-cache')
    // the host merges matching blocks, so a Cache-Control on /* would be joined onto the assets' one
    expect(site().has('Cache-Control')).toBe(false)
  })

  it('ads.txt exists as a template: nothing is declared until there is a publisher ID', () => {
    const lines = read('ads.txt').split(/\r?\n/).filter((l) => l.trim())
    expect(lines.every((l) => l.startsWith('#'))).toBe(true)
    expect(lines).toContain('# google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0')
  })
})
