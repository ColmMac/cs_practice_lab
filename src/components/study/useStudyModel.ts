import { useMemo } from 'react'
import { buildStudyModel, type StudyModel } from '../../core/study/model'
import type { TraceResult } from '../../core/types'
import { getLanguage } from '../../languages/registry'
import { useStore } from '../../store'

/**
 * The table, the questions and the masks for the running study session, or null when Study Mode is off.
 * Depends only on the FROZEN parts of the session (answers, hints and grades change on every keystroke
 * and keep the same `columns`/`config` objects), so editing settings elsewhere can't change the answer key.
 */
export function useStudyModel(result: TraceResult): StudyModel | null {
  const columns = useStore((s) => s.study?.columns)
  const granularity = useStore((s) => s.study?.granularity)
  const display = useStore((s) => s.study?.display)
  const config = useStore((s) => s.study?.config)
  const seed = useStore((s) => s.study?.seed)

  return useMemo(() => {
    if (!columns || !granularity || !display || !config || seed === undefined) return null
    return buildStudyModel(result, { columns, granularity, display, config, seed }, getLanguage(result.language).formatValue)
  }, [result, columns, granularity, display, config, seed])
}
