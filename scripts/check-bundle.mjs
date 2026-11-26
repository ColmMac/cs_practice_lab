// Bundle-size budget: run after `npm run build`. Plain Node, no dependencies. The limits are in bundle-budget.json.
//
// Chunk names carry a content hash (`name-AbCd1234.js`), so chunks are matched by the name before it.
// 1 kB is 1000 bytes, as in Vite's build report.
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'

const HASHED = /^(.+)-[\w-]{8}\.(js|css)$/

/** `index-BpqzVOi1.css` gives `{ name: 'index', type: 'css' }`; a file that isn't a hashed script or style gives null. */
export function parseChunk(file) {
  const match = HASHED.exec(file)
  return match ? { name: match[1], type: match[2] } : null
}

/** The script files a built index.html makes every page download: its entry script and module preloads. */
export function htmlScripts(html) {
  return [...html.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((m) => m[1])
}

const kb = (bytes) => bytes / 1000
const show = (bytes) => `${kb(bytes).toFixed(1)} kB`

/**
 * `chunks` is one `{ file, bytes, gzipBytes }` per file in dist/assets; `loadedByHtml` names the scripts index.html loads.
 * Returns a row per budget group, the scripts and styles that no group names, and a message for each failure.
 */
export function checkBundle(chunks, budget, loadedByHtml) {
  const parsed = chunks.flatMap((chunk) => {
    const id = parseChunk(chunk.file)
    return id ? [{ ...chunk, ...id }] : []
  })
  const failures = []
  const grouped = new Set()

  const rows = budget.groups.map((group) => {
    let gzipBytes = 0
    for (const name of group.chunks) {
      const found = parsed.filter((c) => c.type === group.type && c.name === name)
      // A renamed or merged chunk must not pass by weighing nothing.
      if (found.length === 0) failures.push(`${group.name}: no ${group.type} chunk called "${name}" in the build.`)
      for (const c of found) {
        gzipBytes += c.gzipBytes
        grouped.add(c.file)
      }
    }
    const over = kb(gzipBytes) > group.gzipKb
    if (over) {
      failures.push(
        `${group.name} is ${show(gzipBytes)} gzipped, over its ${group.gzipKb} kB budget (${group.chunks.join(', ')}).`,
      )
    }
    return { name: group.name, gzipBytes, budgetKb: group.gzipKb, over }
  })

  for (const c of parsed) {
    if (kb(c.bytes) > budget.maxChunkMinifiedKb) {
      failures.push(`${c.file} is ${show(c.bytes)} minified, over the ${budget.maxChunkMinifiedKb} kB limit for any chunk.`)
    }
  }

  if (loadedByHtml.length === 0) failures.push('index.html loads no scripts from /assets/: the first load cannot be checked.')
  const firstLoad = budget.groups.filter((g) => g.firstLoad).flatMap((g) => g.chunks)
  for (const file of loadedByHtml) {
    const id = parseChunk(file)
    if (!id || !firstLoad.includes(id.name)) {
      failures.push(`index.html loads ${file}, which is not counted in the first-load budget.`)
    }
  }

  // Styles are all budgeted. Scripts outside every group (small shared chunks, the worker) are only listed.
  const others = parsed.filter((c) => !grouped.has(c.file))
  for (const c of others) {
    if (c.type === 'css') failures.push(`${c.file} is a stylesheet that no budget group counts.`)
  }

  return { rows, others, failures }
}

export function formatReport({ rows, others, failures }) {
  const lines = rows.map(
    (r) => `${r.over ? 'FAIL' : 'ok  '}  ${r.name}: ${show(r.gzipBytes)} gzipped (budget ${r.budgetKb} kB)`,
  )
  if (others.length > 0) {
    lines.push('', 'No gzip budget:', ...others.map((c) => `      ${c.file}: ${show(c.gzipBytes)} gzipped`))
  }
  if (failures.length > 0) {
    lines.push(
      '',
      'Bundle budget failed:',
      ...failures.map((f) => `  - ${f}`),
      '',
      'Make the build smaller. Change bundle-budget.json only if the growth is intended.',
    )
  }
  return lines.join('\n')
}

function main() {
  const root = new URL('../', import.meta.url)
  const assets = new URL('dist/assets/', root)
  let files, html
  try {
    files = readdirSync(assets)
    html = readFileSync(new URL('dist/index.html', root), 'utf8')
  } catch {
    console.error(`No build in ${fileURLToPath(new URL('dist/', root))}. Run "npm run build" first.`)
    process.exit(1)
  }
  const chunks = files.filter(parseChunk).map((file) => {
    const source = readFileSync(new URL(file, assets))
    return { file, bytes: source.length, gzipBytes: gzipSync(source).length }
  })
  const budget = JSON.parse(readFileSync(new URL('bundle-budget.json', root), 'utf8'))
  const result = checkBundle(chunks, budget, htmlScripts(html))
  console.log(formatReport(result))
  if (result.failures.length > 0) process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
