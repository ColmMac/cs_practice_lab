export interface HouseCard {
  text: string
  link: string
  to: string
}

const CHALLENGE_TIP: HouseCard = {
  text: 'Setting work? After a program runs, “Copy student challenge link” makes a fill-in trace table.',
  link: 'Try one on a built-in example',
  to: '/trace-table',
}

/** One card per route, always the same one, and never a link to the page it is on. */
const CARDS: Record<string, HouseCard> = {
  '/': CHALLENGE_TIP,
  '/trace-table': { text: 'Revising logic too?', link: 'Build a truth table', to: '/truth-tables' },
  '/truth-tables': { text: 'Next:', link: 'practise binary, hex and two’s complement', to: '/number-systems' },
  '/number-systems': { text: 'Next:', link: 'step through sorting and searching', to: '/sorting-visualizer' },
  '/sorting-visualizer': CHALLENGE_TIP,
}

const DEFAULT_CARD: HouseCard = { text: 'Practise reading code:', link: 'fill in a trace table', to: '/trace-table' }

export const houseCard = (pathname: string): HouseCard => CARDS[pathname] ?? DEFAULT_CARD
