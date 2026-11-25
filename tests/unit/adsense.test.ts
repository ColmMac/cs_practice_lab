import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { HtmlTagDescriptor } from 'vite'
import { describe, expect, it } from 'vitest'
import { adsense } from '../../src/config/adsensePlugin'

const CLIENT = 'ca-pub-0123456789012345'

function tagsFor(client: string | undefined): HtmlTagDescriptor[] {
  const hook = adsense(client).transformIndexHtml
  if (typeof hook !== 'function') throw new Error('expected a plain transformIndexHtml hook')
  return (hook as () => HtmlTagDescriptor[])()
}

describe('the AdSense head injection', () => {
  it('injects nothing when there is no publisher ID', () => {
    for (const client of [undefined, '', '  ']) expect(tagsFor(client)).toEqual([])
  })

  it('injects the account meta tag and the async loader into <head> for a valid ID', () => {
    expect(tagsFor(CLIENT)).toEqual([
      { tag: 'meta', attrs: { name: 'google-adsense-account', content: CLIENT }, injectTo: 'head' },
      {
        tag: 'script',
        attrs: {
          async: true,
          src: `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`,
          crossorigin: 'anonymous',
        },
        injectTo: 'head',
      },
    ])
  })

  it('fails the build on a malformed ID, naming the variable and the format', () => {
    for (const client of ['pub-0123456789012345', 'ca-pub-123', `${CLIENT}6`, ` ${CLIENT}`, '"><script>']) {
      expect(() => adsense(client), client).toThrow(/VITE_ADSENSE_CLIENT.*"ca-pub-" followed by 16 digits/)
    }
  })

  it('.env.example leaves adverts off and defaults to the production origin', () => {
    const lines = readFileSync(resolve(process.cwd(), '.env.example'), 'utf8').split(/\r?\n/)
    expect(lines.filter((l) => l.trim() && !l.startsWith('#'))).toEqual([
      'VITE_SITE_URL=https://cspracticelab.com',
      'VITE_ADSENSE_CLIENT=',
      'VITE_ADSENSE_SLOT=',
    ])
  })
})
