/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  worker: { format: 'es' },
  server: { headers: devHeaders },
  preview: { headers: siteHeaders },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['tests/unit/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
  },
})
