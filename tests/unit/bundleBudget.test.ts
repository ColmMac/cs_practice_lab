import { checkBundle, formatReport, htmlScripts, parseChunk, type Budget, type ChunkSize } from '../../scripts/check-bundle.mjs'
import tracked from '../../bundle-budget.json'

const budget: Budget = {
  maxChunkMinifiedKb: 480,
  groups: [
    { name: 'First load', type: 'js', chunks: ['index', 'rolldown-runtime'], gzipKb: 100, firstLoad: true },
    { name: 'Editor', type: 'js', chunks: ['codemirror'], gzipKb: 166 },
    { name: 'CSS', type: 'css', chunks: ['index'], gzipKb: 9.5 },
  ],
}

const chunk = (file: string, gzipBytes: number, bytes = gzipBytes * 3): ChunkSize => ({ file, bytes, gzipBytes })

const loaded = ['index-AAAAAAAA.js', 'rolldown-runtime-BB_B-BBB.js']

/** A fake dist/assets listing that passes. */
const listing = () => [
  chunk('index-AAAAAAAA.js', 60_000),
  chunk('rolldown-runtime-BB_B-BBB.js', 400),
  chunk('codemirror-CCCCCCCC.js', 158_000, 474_000),
  chunk('index-DDDDDDDD.css', 9_000),
  chunk('Prose-EEEEEEEE.js', 300),
]

describe('chunk names', () => {
  it('strips the hash, even one with a hyphen or underscore in it', () => {
    expect(parseChunk('rolldown-runtime-BB_B-BBB.js')).toEqual({ name: 'rolldown-runtime', type: 'js' })
    expect(parseChunk('index-DDDDDDDD.css')).toEqual({ name: 'index', type: 'css' })
    expect(parseChunk('favicon.svg')).toBeNull()
  })

  it('reads the entry script and module preloads from the built HTML, not the stylesheet', () => {
    const html = `<script type="module" crossorigin src="/assets/index-AAAAAAAA.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/react-FFFFFFFF.js">
      <link rel="stylesheet" crossorigin href="/assets/index-DDDDDDDD.css">`
    expect(htmlScripts(html)).toEqual(['index-AAAAAAAA.js', 'react-FFFFFFFF.js'])
  })
})

describe('the bundle budget', () => {
  it('adds up each group, keeping scripts and styles of the same name apart', () => {
    const result = checkBundle(listing(), budget, loaded)
    expect(result.failures).toEqual([])
    expect(result.rows.map((r) => r.gzipBytes)).toEqual([60_400, 158_000, 9_000])
    expect(result.others.map((c) => c.file)).toEqual(['Prose-EEEEEEEE.js'])
  })

  it('names the group, its size and its budget when over', () => {
    const files = [...listing(), chunk('index-GGGGGGGG.js', 40_000)]
    const result = checkBundle(files, budget, loaded)
    expect(result.failures).toEqual(['First load is 100.4 kB gzipped, over its 100 kB budget (index, rolldown-runtime).'])
    const report = formatReport(result)
    expect(report).toContain('FAIL  First load: 100.4 kB gzipped (budget 100 kB)')
    expect(report).toContain('ok    Editor: 158.0 kB gzipped')
    expect(report).toContain('Bundle budget failed:\n  - First load is 100.4 kB')
  })

  it('allows a size exactly on the budget', () => {
    const files = listing().map((c) => (c.file === 'index-AAAAAAAA.js' ? chunk(c.file, 99_600) : c))
    expect(checkBundle(files, budget, loaded).failures).toEqual([])
  })

  it('fails any chunk past the minified limit, budgeted or not', () => {
    const result = checkBundle([...listing(), chunk('worker-HHHHHHHH.js', 1_000, 481_000)], budget, loaded)
    expect(result.failures).toEqual(['worker-HHHHHHHH.js is 481.0 kB minified, over the 480 kB limit for any chunk.'])
  })

  it('fails when a budgeted chunk has gone, rather than counting it as nothing', () => {
    const result = checkBundle(
      listing().filter((c) => !c.file.startsWith('codemirror')),
      budget,
      loaded,
    )
    expect(result.failures).toEqual(['Editor: no js chunk called "codemirror" in the build.'])
  })

  it('fails a new preload or stylesheet that would escape its budget', () => {
    const files = [...listing(), chunk('shared-IIIIIIII.js', 500), chunk('extra-JJJJJJJJ.css', 500)]
    expect(checkBundle(files, budget, [...loaded, 'shared-IIIIIIII.js']).failures).toEqual([
      'index.html loads shared-IIIIIIII.js, which is not counted in the first-load budget.',
      'extra-JJJJJJJJ.css is a stylesheet that no budget group counts.',
    ])
  })

  it('fails when index.html loads nothing it can recognise', () => {
    expect(checkBundle(listing(), budget, []).failures).toHaveLength(1)
  })

  it('keeps the tracked chunk limit in step with Vite’s warning limit', () => {
    expect(tracked.maxChunkMinifiedKb).toBe(480)
    expect(tracked.groups.filter((g) => g.firstLoad)).toHaveLength(1)
  })
})
