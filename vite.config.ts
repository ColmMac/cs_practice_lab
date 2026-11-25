/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { renderShell, shellFileName, shellPages } from './src/app/staticShell.ts'
import { SITE_PATHS } from './src/app/tools.ts'
import { adsense } from './src/config/adsensePlugin.ts'
import { isAdsenseClient, resolveSiteUrl } from './src/config/site.ts'

/**
 * The production headers live in ONE place: public/_headers, the file Netlify and Cloudflare Pages serve. The
 * `/*` block is read here so `vite preview` serves exactly what production will, which is how the CSP is tested.
 * The per-path blocks (caching) are the host's job: `vite preview` doesn't apply them. `#` lines are comments.
 */
function readSiteHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  let inSiteBlock = false
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    if (/^\S/.test(line)) inSiteBlock = line.trim() === '/*'
    else if (inSiteBlock && line.trim()) {
      const at = line.indexOf(':')
      headers[line.slice(0, at).trim()] = line.slice(at + 1).trim()
    }
  }
  return headers
}

const siteHeaders = readSiteHeaders()
// The dev server needs inline scripts and a websocket for hot reload, which a strict CSP forbids: dev gets
// everything except the CSP. Build + `npm run preview` is the way to test the real policy.
const devHeaders = Object.fromEntries(Object.entries(siteHeaders).filter(([name]) => name !== 'Content-Security-Policy'))

/**
 * The files crawlers read, all built from the route table (src/app/tools.ts): robots.txt, sitemap.xml and one HTML
 * shell per route with that route's own <head> (src/app/staticShell.ts). Runs after Vite has written the script and
 * style tags into index.html, so every shell has them.
 */
function seoFiles(siteUrl: string, adsEnabled: boolean): Plugin {
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const robots = ['User-agent: *', 'Allow: /', '', 'Sitemap: ' + siteUrl + '/sitemap.xml']
        this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' })

        const lastmod = new Date().toISOString().slice(0, 10)
        const urls = SITE_PATHS.map((p) => '  <url><loc>' + siteUrl + p + '</loc><lastmod>' + lastmod + '</lastmod></url>')
        const xml = [
          '<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
          ...urls,
          '</urlset>',
        ]
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml.join('\n') + '\n' })

        const index = bundle['index.html']
        if (index?.type !== 'asset') throw new Error('seo-files: the build has no index.html')
        const template = String(index.source)
        for (const page of shellPages(adsEnabled)) {
          const source = renderShell(template, page, siteUrl)
          if (page.path === '/') index.source = source
          else this.emitFile({ type: 'asset', fileName: shellFileName(page.path), source })
        }
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [
      react(),
      tailwindcss(),
      adsense(env.VITE_ADSENSE_CLIENT),
      // after adsense: the shells are cloned from the transformed index.html
      seoFiles(resolveSiteUrl(env.VITE_SITE_URL), isAdsenseClient(env.VITE_ADSENSE_CLIENT)),
    ],
    worker: { format: 'es' },
    server: { headers: devHeaders },
    preview: { headers: siteHeaders },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['tests/unit/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    },
  }
})
