import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router'
import { findGuide, GUIDES, guideSections, type Guide, type GuideTable } from '../../src/app/guides'
import { AppRoutes } from '../../src/app/routes'
import { renderShell, shellPages } from '../../src/app/staticShell'
import { TOOLS } from '../../src/app/tools'
import { binarySearch, bubbleSort, buildHistory, parseSortingUrl } from '../../src/core/algorithms'
import { FakeTraceRunner } from '../../src/core/fake/FakeTraceRunner'
import { buildTruthTable, parseProgram } from '../../src/core/logic'
import { add, fromBinary, fromSigned, invert, negate, parseNumberUrl, toBinary, toHex, toSigned, toUnsigned } from '../../src/core/numbers'
import { useStore } from '../../src/store'
import { setRunnerOverride } from '../../src/store/runner'
import { traces } from './fixtures'

// CodeMirror needs real layout APIs jsdom doesn't have; the editor is covered in the browser.
vi.mock('../../src/components/editor/CodeEditor', () => ({ CodeEditor: () => <textarea aria-label="Code editor" /> }))

beforeEach(() => {
  localStorage.clear()
  setRunnerOverride(new FakeTraceRunner(traces.digitSum))
})
afterEach(() => {
  cleanup()
  useStore.getState().cancelScheduledRerun()
  useStore.setState({ study: null, challenge: null, result: null })
})

const guideOf = (path: string): Guide => findGuide(path)!

async function open(url: string) {
  const user = userEvent.setup()
  render(
    <MemoryRouter initialEntries={[url]}>
      <AppRoutes />
    </MemoryRouter>,
  )
  await screen.findByRole('heading', { level: 1 }, { timeout: 10_000 })
  return user
}

/** The FAQPage blocks in the document, as question/answer pairs. */
const faqMarkup = () =>
  [...document.querySelectorAll('script[type="application/ld+json"]')]
    .map((s) => JSON.parse(s.textContent!) as { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] })
    .filter((b) => b['@type'] === 'FAQPage')
    .map((b) => b.mainEntity!.map((q) => ({ question: q.name, answer: q.acceptedAnswer.text })))

const words = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

/** Block elements put no space between their texts in `textContent`, so count leaf by leaf. */
const visibleWords = (el: Element) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const parts: string[] = []
  while (walker.nextNode()) parts.push(walker.currentNode.textContent!)
  return words(parts.join(' '))
}

describe('a guide under every tool', () => {
  it('there is one guide per tool, in nav order', () => {
    expect(GUIDES.map((g) => g.path)).toEqual(TOOLS.map((t) => t.path))
  })

  it.each(TOOLS.map((t) => t.path))('%s renders its guide, and the FAQ markup is exactly the visible FAQ', async (path) => {
    await open(path)
    const guide = guideOf(path)
    const section = screen.getByRole('region', { name: guide.title })
    expect(within(section).getByRole('heading', { level: 2, name: guide.title })).toBeInTheDocument()
    expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      ...guideSections(guide).map((s) => s.heading),
      'Questions and answers',
    ])
    // the ticket's range is 300 to 600 words
    expect(visibleWords(section)).toBeGreaterThanOrEqual(300)
    expect(visibleWords(section)).toBeLessThanOrEqual(600)

    const shown = within(section)
      .getAllByRole('heading', { level: 4 })
      .map((h) => ({ question: h.textContent, answer: h.nextElementSibling!.textContent }))
    expect(shown.length).toBeGreaterThanOrEqual(3)
    expect(faqMarkup()).toEqual([shown])
    // outside <main>, so it never takes space from the workspace
    expect(section.closest('main main')).toBeNull()
  })

  it.each([
    ['/number-systems?mode=practice', '/number-systems'],
    ['/sorting-visualizer?quiz=1', '/sorting-visualizer'],
  ])('%s shows no guide and claims no FAQ', async (url, path) => {
    await open(url)
    expect(screen.queryByRole('region', { name: guideOf(path).title })).not.toBeInTheDocument()
    expect(faqMarkup()).toEqual([])
  })

  it('truth-table Study mode takes the guide away, and leaving brings it back', async () => {
    const user = await open('/truth-tables')
    const { title } = guideOf('/truth-tables')
    await user.click(screen.getByRole('button', { name: 'Study mode' }))
    expect(screen.queryByRole('region', { name: title })).not.toBeInTheDocument()
    expect(faqMarkup()).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Study mode: on' }))
    expect(screen.getByRole('region', { name: title })).toBeInTheDocument()
  })

  it('trace Study mode takes the guide away', async () => {
    const user = await open('/trace-table')
    const { title } = guideOf('/trace-table')
    const start = await screen.findByRole('button', { name: 'Study mode' }, { timeout: 10_000 })
    await waitFor(() => expect(start).toBeEnabled())
    await user.click(start)
    await waitFor(() => expect(screen.queryByRole('region', { name: title })).not.toBeInTheDocument())
    expect(faqMarkup()).toEqual([])
  })
})

describe('the copy for readers without JavaScript', () => {
  const template = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')

  it.each(TOOLS.map((t) => t.path))('the %s shell has the whole guide and its FAQPage', (path) => {
    const guide = guideOf(path)
    const html = renderShell(template, shellPages(false).find((p) => p.path === path)!, 'https://cspracticelab.com')
    const body = new DOMParser().parseFromString(html.match(/<noscript>([\s\S]*)<\/noscript>/)![1]!, 'text/html').body
    expect(body.querySelector('h2')!.textContent).toBe(guide.title)
    expect(visibleWords(body)).toBeGreaterThan(300)
    expect([...body.querySelectorAll('h4')].map((h) => h.textContent)).toEqual(guide.faq.map((f) => f.question))
    expect(body.querySelectorAll('table').length).toBe(guideSections(guide).flatMap((s) => s.blocks).filter((b) => 'table' in b).length)

    const doc = new DOMParser().parseFromString(html, 'text/html')
    const faq = [...doc.head.querySelectorAll('script[type="application/ld+json"]')]
      .map((s) => JSON.parse(s.textContent!))
      .find((b) => b['@type'] === 'FAQPage')
    expect(faq.mainEntity.map((q: { name: string }) => q.name)).toEqual(guide.faq.map((f) => f.question))
  })
})

// A wrong worked example on a revision site is worse than none: each is checked against the code the tools run.
describe('worked examples', () => {
  const tables = (g: Guide): GuideTable[] => g.workedExample.blocks.flatMap((b) => ('table' in b ? [b.table] : []))
  const links = (g: Guide): URL[] =>
    g.workedExample.blocks.flatMap((b) => ('example' in b ? [new URL(b.example.href, 'https://x.test')] : []))

  it('trace: the program is the preset, and the table is the hand-reviewed golden from the real tracer', () => {
    const guide = guideOf('/trace-table')
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8').replaceAll('\r\n', '\n').trimEnd()
    const code = guide.workedExample.blocks.flatMap((b) => ('code' in b ? [b.code] : []))
    expect(code).toEqual([read('src/languages/python/presets/linear-search.py')])
    const golden = read('tests/fixtures/presets/linear-search.compact.txt')
      .split('\n')
      .filter((line) => !line.startsWith('-'))
      .map((line) => line.split('|').map((c) => c.trim()))
    const [table] = tables(guide)
    expect([table!.head, ...table!.rows]).toEqual(golden)
    expect(links(guide)[0]!.searchParams.get('preset')).toBe('linear-search')
  })

  it('truth: every row matches the evaluator', () => {
    const guide = guideOf('/truth-tables')
    const source = links(guide)[0]!.searchParams.get('expr')!
    const built = buildTruthTable(parseProgram(source), { intermediates: true })
    const [table] = tables(guide)
    expect(table!.head).toEqual(built.columns.map((c) => c.label))
    expect(table!.rows).toEqual(built.rows.map((r) => r.cells))
  })

  it('truth: the claims in the prose', () => {
    const outputs = (src: string) => buildTruthTable(parseProgram(src)).rows.map((r) => r.cells.at(-1)).join('')
    expect(outputs('NOT (A AND B)')).toBe(outputs('(NOT A) OR (NOT B)'))
    expect(outputs('NOT (A AND B)')).not.toBe(outputs('(NOT A) AND (NOT B)'))
    expect(outputs('(A OR B) AND C')).not.toBe(outputs('A OR B AND C'))
    expect(outputs('A XOR B XOR C')).toBe('01101001')
    // the spellings the guide says can be typed, and the ones it says can't
    for (const src of ['A · B', 'A & B', 'NOT A', '! A', '¬A', 'A + B', 'A ⊕ B']) expect(() => parseProgram(src), src).not.toThrow()
    for (const src of ['A . B', 'A̅']) expect(() => parseProgram(src), src).toThrow()
  })

  it('numbers: negating 37, and the sum in the FAQ', () => {
    const guide = guideOf('/number-systems')
    const start = parseNumberUrl(links(guide)[0]!.searchParams).bits!
    expect(toSigned(start)).toBe(37)
    expect(tables(guide)[0]!.rows.map((r) => r[1])).toEqual([toBinary(start), toBinary(invert(start)), toBinary(negate(start))])
    const result = fromSigned(-37, 8)
    expect(negate(start)).toEqual(result)
    expect([toUnsigned(result), toHex(result)]).toEqual([219, 'DB'])

    const sum = add(fromBinary('01100100', 8), fromBinary('00110010', 8))
    expect([toBinary(sum.bits), toSigned(sum.bits), sum.overflow]).toEqual(['10010110', -106, true])
  })

  it('sorting: the bubble sort passes and the binary search probes', () => {
    const guide = guideOf('/sorting-visualizer')
    const [bubbleUrl, searchUrl] = links(guide).map((u) => parseSortingUrl(u.searchParams))
    const [bubble, search] = tables(guide)

    expect(bubbleUrl!.algo).toBe('bubble')
    const passes = buildHistory(bubbleSort(bubbleUrl!.data!)).rows.map(({ cells }) => [
      cells[0],
      cells.slice(1, -2).join(', '),
      ...cells.slice(-2),
    ])
    expect(bubble!.rows).toEqual(passes)

    expect(searchUrl!.algo).toBe('binary')
    const run = binarySearch(searchUrl!.data!, searchUrl!.target!)
    expect(search!.rows).toEqual(buildHistory(run).rows.map((r) => r.cells.slice(0, 5)))
    expect(run.foundAt).toBe(6)
  })
})
