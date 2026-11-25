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
    blurb: 'Run Python and get a line-by-line trace table, then fill it in yourself in Study mode.',
    description: 'Run Python in your browser and get a step-by-step trace table, with exam blanks, a study mode and exports.',
  },
  {
    path: '/truth-tables',
    name: 'Truth tables',
    blurb: 'Type a Boolean expression or pick a logic circuit and get its truth table.',
    description: 'Build truth tables for Boolean expressions and logic gates, with exam-style columns.',
  },
  {
    path: '/number-systems',
    name: 'Number systems',
    blurb: 'Convert between binary, denary and hex, and practise two’s complement.',
    description: 'Toggle bits and see denary, signed, binary and hex update together, with shifts and two’s complement.',
  },
  {
    path: '/sorting-visualizer',
    name: 'Sorting & searching',
    blurb: 'Step through sorting and searching algorithms, with pass-by-pass tables.',
    description: 'Step through bubble, insertion and merge sort and linear and binary search, one comparison at a time.',
  },
]

/** Every indexable route, the home page first. sitemap.xml is generated from this. */
export const SITE_PATHS: readonly string[] = ['/', ...TOOLS.map((t) => t.path)]

export function toolDescription(path: string): string {
  return TOOLS.find((t) => t.path === path)?.description ?? ''
}
