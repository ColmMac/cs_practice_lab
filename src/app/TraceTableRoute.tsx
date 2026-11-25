import { App } from '../App'
import { PageMeta } from './PageMeta'
import { toolDescription } from './tools'
import { usePresetParam } from './usePresetParam'

/** The trace-table route: the app plus `?preset=` handling. Lazy-loaded, so the home page never pulls in the store. */
export function TraceTableRoute() {
  const preparingStudy = usePresetParam()
  return (
    <>
      <PageMeta title="Trace tables" description={toolDescription('/trace-table')} />
      <App preparingStudy={preparingStudy} />
    </>
  )
}
