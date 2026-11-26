/**
 * Per-route HTML at build time. Each route gets a copy of the built index.html with its own <head> and a <noscript>
 * copy of its text, so crawlers and link previews that run no JavaScript see the right page. Pure string work,
 * imported by `vite.config.ts` in Node.
 */
import { SITE_DESCRIPTION, SITE_NAME } from '../config/site.ts'
import { findGuide, FAQ_HEADING, guideSections, type Guide, type GuideBlock } from './guides/index.ts'
import { ABOUT, ACCESSIBILITY, privacyDoc, type Block, type InfoDoc, type Inline } from './info/content.ts'
import { jsonLdText, pageHead, type Faq, type PageHead, type PageInput } from './seo.ts'
import { INFO_PAGES, SITE_PATHS, TOOLS } from './tools.ts'

const escapeHtml = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')

const link = (href: string, text: string): string => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`
const inline = (parts: Inline[]): string => parts.map((p) => (typeof p === 'string' ? escapeHtml(p) : link(p.href, p.text))).join('')
const block = (b: Block): string =>
  'p' in b ? `<p>${inline(b.p)}</p>` : `<ul>${b.ul.map((item) => `<li>${inline(item)}</li>`).join('')}</ul>`

function infoHtml(name: string, doc: InfoDoc): string {
  return [
    `<h1>${escapeHtml(name)}</h1>`,
    `<p>${inline(doc.intro)}</p>`,
    ...doc.sections.map((s) => `<h2>${escapeHtml(s.heading)}</h2>${s.blocks.map(block).join('')}`),
    ...(doc.updated ? [`<p>${doc.updatedLabel ?? 'Last updated'}: ${doc.updated}</p>`] : []),
  ].join('\n')
}

function guideBlock(b: GuideBlock): string {
  if ('code' in b) return `<pre><code>${escapeHtml(b.code)}</code></pre>`
  if ('example' in b) return `<p>${link(b.example.href, b.example.text)}</p>`
  if ('table' in b) {
    const row = (tag: 'th' | 'td', cells: string[]) => `<tr>${cells.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join('')}</tr>`
    const { caption, head, rows } = b.table
    return `<table><caption>${escapeHtml(caption)}</caption>${row('th', head)}${rows.map((r) => row('td', r)).join('')}</table>`
  }
  return block(b)
}

function guideHtml(g: Guide): string {
  return [
    `<h2>${escapeHtml(g.title)}</h2>`,
    `<p>${inline(g.intro)}</p>`,
    ...guideSections(g).map((s) => `<h3>${escapeHtml(s.heading)}</h3>${s.blocks.map(guideBlock).join('')}`),
    `<h3>${FAQ_HEADING}</h3>`,
    ...g.faq.map((f) => `<h4>${escapeHtml(f.question)}</h4><p>${escapeHtml(f.answer)}</p>`),
  ].join('\n')
}

export interface ShellPage {
  path: string
  /** Absent for the home page. */
  title?: string
  description: string
  /** What a reader without JavaScript gets, as HTML. */
  body: string
  /** The questions in the body, for the FAQPage markup. */
  faq?: readonly Faq[]
}

const siteLinks = (): string =>
  `<ul>${[{ path: '/', name: SITE_NAME }, ...TOOLS, ...INFO_PAGES].map((p) => `<li>${link(p.path, p.name)}</li>`).join('')}</ul>`

/** The routes that get their own HTML, in `SITE_PATHS` order. */
export function shellPages(adsEnabled: boolean): ShellPage[] {
  const infoDocs: Record<string, InfoDoc> = { '/about': ABOUT, '/privacy': privacyDoc(adsEnabled), '/accessibility': ACCESSIBILITY }
  return SITE_PATHS.map((path): ShellPage => {
    if (path === '/') {
      const tools = TOOLS.map((t) => `<li>${link(t.path, t.name)}: ${escapeHtml(t.blurb)}</li>`).join('')
      return { path, description: SITE_DESCRIPTION, body: `<h1>${SITE_NAME}</h1>\n<p>${escapeHtml(SITE_DESCRIPTION)}</p>\n<ul>${tools}</ul>` }
    }
    const tool = TOOLS.find((t) => t.path === path)
    if (tool) {
      const guide = findGuide(path)
      if (!guide) throw new Error(`No guide for ${path}`)
      const body = [
        `<h1>${escapeHtml(tool.name)}</h1>`,
        `<p>${escapeHtml(tool.description)}</p>`,
        `<p>${escapeHtml(tool.blurb)}</p>`,
        '<p>This tool needs JavaScript.</p>',
        guideHtml(guide),
      ].join('\n')
      return { path, title: tool.name, description: tool.description, body, faq: guide.faq }
    }
    const info = INFO_PAGES.find((p) => p.path === path)
    const doc = infoDocs[path]
    if (!info || !doc) throw new Error(`No static page content for ${path}`)
    return { path, title: info.name, description: info.description, body: infoHtml(info.name, doc) }
  })
}

/** Every tag carries `data-default`: main.tsx removes them all before React renders its own. */
function headTags(head: PageHead): string[] {
  return [
    `<meta data-default name="description" content="${escapeHtml(head.description)}" />`,
    `<link data-default rel="canonical" href="${escapeHtml(head.canonical)}" />`,
    ...head.social.map((m) => `<meta data-default ${m.attr}="${m.key}" content="${escapeHtml(m.content)}" />`),
    ...head.jsonLd.map((b) => `<script data-default type="application/ld+json">${jsonLdText(b)}</script>`),
  ]
}

/** Replace exactly one match, or fail the build: a silently unpatched shell would ship the wrong head. */
function replaceOnce(html: string, pattern: RegExp, value: string): string {
  if (!pattern.test(html)) throw new Error(`The HTML template has no match for ${pattern}`)
  return html.replace(pattern, () => value)
}

/** `template` is the built index.html. `<head>` additions it already has (scripts, styles) are kept. */
export function renderShell(template: string, page: ShellPage, siteUrl: string): string {
  const input: PageInput = { title: page.title, description: page.description, pathname: page.path, siteUrl, faq: page.faq }
  const head = pageHead(input)
  let html = replaceOnce(template, /<title>[^<]*<\/title>/, `<title>${escapeHtml(head.title)}</title>`)
  html = replaceOnce(html, /[ \t]*<meta\s+data-default\s+name="description"[^>]*>\r?\n?/, '')
  html = replaceOnce(html, /<\/head>/, `  ${headTags(head).join('\n    ')}\n  </head>`)
  const nav = page.path === '/' ? '' : `\n${siteLinks()}`
  return replaceOnce(html, /<div id="root"><\/div>/, `<noscript>\n${page.body}${nav}\n</noscript>\n    <div id="root"></div>`)
}

/** `/trace-table` → `trace-table.html`, which the host serves at the extensionless address. */
export const shellFileName = (path: string): string => (path === '/' ? 'index.html' : `${path.slice(1)}.html`)
