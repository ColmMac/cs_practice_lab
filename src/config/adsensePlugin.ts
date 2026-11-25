/**
 * Puts the AdSense account meta tag and loader script into index.html at build time, and only when the build has a
 * publisher ID. The route shells are cloned from the transformed HTML, so they get the same tags. Imported by
 * `vite.config.ts` in Node: keep it free of React and the browser.
 */
import type { HtmlTagDescriptor, Plugin } from 'vite'
import { isAdsenseClient } from './site.ts'

const LOADER_URL = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'

/** `client` is `VITE_ADSENSE_CLIENT`. Empty means no adverts; anything else must be a well-formed ID. */
export function adsense(client: string | undefined): Plugin {
  const value = client ?? ''
  if (value.trim() && !isAdsenseClient(value)) {
    throw new Error(
      `VITE_ADSENSE_CLIENT is "${value}", which is not a publisher ID. ` +
        'It must be "ca-pub-" followed by 16 digits. Leave it empty to build without ads.',
    )
  }
  const tags: HtmlTagDescriptor[] = isAdsenseClient(value)
    ? [
        { tag: 'meta', attrs: { name: 'google-adsense-account', content: value }, injectTo: 'head' },
        { tag: 'script', attrs: { async: true, src: `${LOADER_URL}?client=${value}`, crossorigin: 'anonymous' }, injectTo: 'head' },
      ]
    : []
  return { name: 'adsense', transformIndexHtml: () => tags }
}
