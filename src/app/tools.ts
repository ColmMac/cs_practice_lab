/** The hub's tools, in nav order. The single source for the nav, the home directory, page metadata and sitemap.xml. */
export interface ToolInfo {
  path: string
  name: string
  blurb: string
  /** `<meta name="description">` for the tool's page. */
  description: string
}

export const TOOLS: readonly ToolInfo[] = [
  {
    path: '/trace-table',
    name: 'Trace tables',
    blurb: 'Run Python and get a step-by-step trace table.',
    description: 'Run Python in your browser and get a step-by-step trace table, with exam blanks, a study mode and exports.',
  },
  {
    path: '/truth-tables',
    name: 'Truth tables',
    blurb: 'Boolean expressions and logic gates.',
    description: 'Build truth tables for Boolean expressions and logic gates, with exam-style columns.',
  },
  {
    path: '/number-systems',
    name: 'Number systems',
    blurb: 'Binary, hex and two’s complement.',
    description: 'Toggle bits and see denary, signed, binary and hex update together, with shifts and two’s complement.',
  },
  {
    path: '/sorting-visualizer',
    name: 'Sorting & searching',
    blurb: 'Step through sorting and searching algorithms.',
    description: 'Step through bubble, insertion and merge sort and linear and binary search, one comparison at a time.',
  },
]

export const BRAND = 'CS Study Hub'

export const HOME_DESCRIPTION =
  'Free computer science revision tools for GCSE, SQA Higher, A-Level and CS1: trace tables, truth tables, number systems and sorting. No login, runs in your browser.'

/** Every indexable route, the home page first. sitemap.xml is generated from this. */
export const SITE_PATHS: readonly string[] = ['/', ...TOOLS.map((t) => t.path)]

export function toolDescription(path: string): string {
  return TOOLS.find((t) => t.path === path)?.description ?? ''
}
