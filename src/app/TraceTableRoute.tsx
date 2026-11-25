import { App } from '../App'
import { useStore } from '../store'
import { findGuide } from './guides'
import { PageMeta } from './PageMeta'
import { ToolGuide } from './ToolGuide'
import { toolDescription } from './tools'
import { usePresetParam } from './usePresetParam'

const GUIDE = findGuide('/trace-table')!

/** The trace-table route: the app plus `?preset=` handling. Lazy-loaded, so the home page never pulls in the store. */
export function TraceTableRoute() {
  const preparingStudy = usePresetParam()
  const studying = useStore((s) => s.study !== null || s.challenge !== null)
  // the guide's worked table is one of the examples: never under a table that is being filled in
  const guide = preparingStudy || studying ? null : GUIDE
  return (
    <>
      <PageMeta title="Trace tables" description={toolDescription('/trace-table')} faq={guide?.faq} />
      <App preparingStudy={preparingStudy} />
      {guide && <ToolGuide guide={guide} />}
    </>
  )
}
