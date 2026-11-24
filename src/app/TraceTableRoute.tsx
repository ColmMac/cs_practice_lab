import { App } from '../App'
import { usePresetParam } from './usePresetParam'

/** The trace-table route: the app plus `?preset=` handling. Lazy-loaded, so the home page never pulls in the store. */
export function TraceTableRoute() {
  usePresetParam()
  return <App />
}
