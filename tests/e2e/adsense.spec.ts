import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * The AdSense head tags are decided at build time. The served build has no publisher ID; the other cases build
 * again into a temporary folder with a fake one, and only the files are read, so nothing is requested from Google.
 */

const PAGES = ['index', 'trace-table', 'truth-tables', 'number-systems', 'sorting-visualizer', 'about', 'privacy']
const FAKE_CLIENT = 'ca-pub-0000000000000000'

function build(client: string, outDir: string) {
  const result = spawnSync(
    process.execPath,
    ['node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'],
    // a variable that is set, even to nothing, wins over any local .env file
    { env: { ...process.env, VITE_ADSENSE_CLIENT: client, VITE_ADSENSE_SLOT: '' }, encoding: 'utf8' },
  )
  return { status: result.status, output: result.stdout + result.stderr }
}

const count = (text: string, part: string) => text.split(part).length - 1

test('the default build serves no AdSense tag on any route', async ({ request }) => {
  for (const name of PAGES) {
    const html = await (await request.get(name === 'index' ? '/' : `/${name}`)).text()
    expect(html, name).not.toMatch(/google-adsense-account|googlesyndication|adsbygoogle/)
  }
})

test.describe('built with other publisher IDs', () => {
  let dir: string
  test.beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'adsense-build-'))
  })
  test.afterAll(() => rmSync(dir, { recursive: true, force: true }))

  test('a valid ID puts one meta tag and one loader in the <head> of every route shell', () => {
    const { status, output } = build(FAKE_CLIENT, dir)
    expect(status, output).toBe(0)
    for (const name of PAGES) {
      const html = readFileSync(join(dir, `${name}.html`), 'utf8')
      const head = html.slice(0, html.indexOf('</head>'))
      expect(count(html, 'name="google-adsense-account"'), name).toBe(1)
      expect(count(html, 'adsbygoogle.js'), name).toBe(1)
      expect(head, name).toContain(`<meta name="google-adsense-account" content="${FAKE_CLIENT}">`)
      expect(head, name).toContain(
        `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${FAKE_CLIENT}" crossorigin="anonymous"></script>`,
      )
    }
    expect(readFileSync(join(dir, 'privacy.html'), 'utf8')).toContain('The site shows adverts from Google AdSense')
  })

  test('a malformed ID fails the build with a message that says why', () => {
    const { status, output } = build('ca-pub-123', dir)
    expect(status).not.toBe(0)
    expect(output).toContain('VITE_ADSENSE_CLIENT is "ca-pub-123"')
  })
})
