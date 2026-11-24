import type { TraceResult } from '../../core/types'
import { useStore } from '../../store'
import { ColumnManager } from './ColumnManager'
import { Segmented } from './Segmented'

export function TableControls({ result }: { result: TraceResult }) {
  const { granularity, setGranularity, displayStyle, setDisplayStyle } = useStore()
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-5 gap-y-2">
      <ColumnManager result={result} />
      <Segmented
        label="Rows"
        value={granularity}
        onChange={setGranularity}
        options={[
          { value: 'compact', label: 'Compact', hint: 'A row only when a variable changes, a function returns, or something prints' },
          { value: 'every-line', label: 'Every line', hint: 'A row for every executed line, including if / while / for tests' },
        ]}
      />
      <Segmented
        label="Cells"
        value={displayStyle}
        onChange={setDisplayStyle}
        options={[
          { value: 'exam', label: 'Exam blanks', hint: 'A value only on the row where it changes' },
          { value: 'carry', label: 'Carry forward', hint: 'Every cell shows the variable’s current value' },
        ]}
      />
    </div>
  )
}
