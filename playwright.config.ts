import { defineConfig, devices } from '@playwright/test'

/**
 * E2E runs against PRODUCTION builds served by `vite preview`, so the real security headers (CSP and COOP from
 * public/_headers) are in force. `npm run test:e2e` builds first.
 *
 * Two projects, two builds. `app` is the build as it ships today, with no AdSense IDs. `ads` runs the tests tagged
 * @ads against a second build with fake IDs, in dist-ads/. Both servers start whichever tests are selected.
 * `firefox` and `webkit` run only the tests tagged @smoke, against the `app` build.
 *
 * Browsers: `npx playwright install chromium firefox webkit` once. `app` and `ads` use bundled Chromium; if it
 * cannot launch (e.g. Windows Application Control), run those two with a system browser instead:
 * $env:PW_CHANNEL = 'msedge'  (or 'chrome').
 */
const PORT = 4173
const ADS_PORT = 4174

/** A system browser in place of bundled Chromium: the Chromium projects only. */
const channel = process.env.PW_CHANNEL || undefined

/** This process's environment with the AdSense variables set. A variable that is set, even to nothing, wins over .env files. */
const withAds = (client: string, slot: string) => ({
  ...(process.env as Record<string, string>),
  VITE_ADSENSE_CLIENT: client,
  VITE_ADSENSE_SLOT: slot,
})

export default defineConfig({
  testDir: 'tests/e2e',
  // The first run downloads Pyodide (~10 MB) from the CDN.
  timeout: 90_000,
  expect: { timeout: 45_000 },
  fullyParallel: false,
  workers: 1,
  // CI gets one retry, and an HTML report that the workflow uploads if the job fails.
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'app', grepInvert: /@ads/, use: { channel } },
    {
      name: 'ads',
      testMatch: /adslot\.spec\.ts/,
      grep: /@ads/,
      use: { channel, baseURL: `http://localhost:${ADS_PORT}` },
    },
    { name: 'firefox', grep: /@smoke/, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', grep: /@smoke/, use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      env: withAds('', ''),
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      command: `npx vite build --outDir dist-ads --emptyOutDir && npx vite preview --outDir dist-ads --port ${ADS_PORT} --strictPort`,
      url: `http://localhost:${ADS_PORT}`,
      env: withAds('ca-pub-0000000000000000', '0000000000'),
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
})
