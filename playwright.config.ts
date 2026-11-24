import { defineConfig } from '@playwright/test'

/**
 * E2E runs against the PRODUCTION build served by `vite preview`, so the real security headers
 * (CSP, COOP/COEP from public/_headers) are in force. `npm run test:e2e` builds first.
 *
 * Browser: bundled Chromium by default. If it cannot launch (e.g. Windows Application Control),
 * run with a system browser instead:  $env:PW_CHANNEL = 'msedge'  (or 'chrome').
 */
const PORT = 4173

export default defineConfig({
  testDir: 'tests/e2e',
  // The first run downloads Pyodide (~10 MB) from the CDN.
  timeout: 90_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 180_000,
  },
})
