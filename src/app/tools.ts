/** The hub's tools, in nav order. The single source for the nav, the home directory and the placeholders. */
export interface ToolInfo {
  path: string
  name: string
  blurb: string
}

export const TOOLS: readonly ToolInfo[] = [
  { path: '/trace-table', name: 'Trace tables', blurb: 'Run Python and get a step-by-step trace table.' },
  { path: '/truth-tables', name: 'Truth tables', blurb: 'Boolean expressions and logic gates.' },
  { path: '/number-systems', name: 'Number systems', blurb: 'Binary, hex and two’s complement.' },
  { path: '/sorting-visualizer', name: 'Sorting & searching', blurb: 'Step through sorting and searching algorithms.' },
]

export const BRAND = 'CS Study Hub'
