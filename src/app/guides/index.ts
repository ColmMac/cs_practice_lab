import { NUMBER_GUIDE } from './numberSystems.ts'
import { SORTING_GUIDE } from './sorting.ts'
import { TRACE_GUIDE } from './traceTables.ts'
import { TRUTH_GUIDE } from './truthTables.ts'
import type { Guide } from './types.ts'

export { FAQ_HEADING, guideSections } from './types.ts'
export type { Guide, GuideBlock, GuideSection, GuideTable } from './types.ts'

/** One per tool, in nav order. */
export const GUIDES: readonly Guide[] = [TRACE_GUIDE, TRUTH_GUIDE, NUMBER_GUIDE, SORTING_GUIDE]

export const findGuide = (path: string): Guide | undefined => GUIDES.find((g) => g.path === path)
