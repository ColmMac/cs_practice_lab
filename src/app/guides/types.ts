/**
 * The written guide under a tool, as data: the page, the <noscript> copy in the route's HTML and the FAQPage
 * JSON-LD all come from it, so they can't drift apart. Imported by Node (the build): no React.
 */
import type { Block, Inline } from '../info/content.ts'
import type { Faq } from '../seo.ts'

export interface GuideTable {
  caption: string
  head: string[]
  /** An empty string is a blank cell. */
  rows: string[][]
}

/**
 * Prose, a list, a program listing or a table. `example` opens the worked example in the tool. It is a full page
 * load on purpose: the truth, number and sorting pages read the address only once.
 */
export type GuideBlock = Block | { code: string } | { table: GuideTable } | { example: { href: string; text: string } }

export interface GuideSection {
  heading: string
  blocks: GuideBlock[]
}

export interface Guide {
  path: string
  title: string
  intro: Inline[]
  steps: GuideSection
  /** What this subject needs beyond the method. */
  topics: GuideSection[]
  workedExample: GuideSection
  examTips: GuideSection
  /** Plain text: shown as written, and copied word for word into the FAQPage markup. */
  faq: Faq[]
}

export const FAQ_HEADING = 'Questions and answers'

/** The sections in the order they are read. The FAQ comes after them. */
export const guideSections = (g: Guide): GuideSection[] => [g.steps, ...g.topics, g.workedExample, g.examTips]
