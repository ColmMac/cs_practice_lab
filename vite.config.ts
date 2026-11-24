/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { SITE_PATHS } from './src/app/tools.ts'

/**
 * The production headers live in ONE place: public/_headers, the file Netlify and Cloudflare Pages serve. The
 * `/*` block is read here so `vite preview` serves exactly what production will, which is how the CSP is tested.
 * (COOP/COEP also enable SharedArrayBuffer; the app works without them.)
 */
function readSiteHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  let inSiteBlock = false
  for (const line of readFileSync(new URL('./public/_headers', import.meta.url), 'utf8').split(/\r?\n/)) {
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
 * robots.txt and sitemap.xml, built from the route table (src/app/tools.ts). Absolute URLs need the production
 * origin: with VITE_SITE_URL unset the sitemap is skipped (with a warning) and robots.txt omits its Sitemap line.
 */
function seoFiles(origin: string): Plugin {
  return {
    name: 'seo-files',
    apply: 'build',
    generateBundle() {
      const site = origin.trim().replace(/\/+$/, '')
      const robots = ['User-agent: *', 'Allow: /', ...(site ? ['', 'Sitemap: ' + site + '/sitemap.xml'] : [])]
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots.join('\n') + '\n' })
      if (!site) {
        this.warn('VITE_SITE_URL is not set: sitemap.xml was not generated.')
        return
      }
      const urls = SITE_PATHS.map((p) => '  <url><loc>' + site + p + '</loc></url>')
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        '</urlset>',
      ]
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: xml.join('\n') + '\n' })
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), seoFiles(loadEnv(mode, process.cwd(), 'VITE_').VITE_SITE_URL ?? '')],
  worker: { format: 'es' },
  server: { headers: devHeaders },
  preview: { headers: siteHeaders },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
}))
