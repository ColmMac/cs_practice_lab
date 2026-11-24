import { useMemo, useState } from 'react'
import { buildTruthTableModel, truthBaseName } from '../../core/export/truthModel'
import type { ExportVariant } from '../../core/export/tableModel'
import { truthMasks, type TruthTable } from '../../core/logic'
import { newSeed } from '../../core/study/rng'
import { ExportPanel } from '../ui/ExportPanel'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import type { TruthStudy } from './useTruthStudy'

interface Props {
  /** The live table (never the frozen study view: a worksheet is built from the same rows). */
  table: TruthTable
  /** The expression as parsed (not the box, which may have been edited since). */
  expression: string
  study: TruthStudy
}

/**
 * Export for the truth table. The worksheet blanks the study mask: the running session's if there is one,
 * otherwise what the study settings would hide.
 */
export function TruthExport({ table, expression, study }: Props) {
  const [variant, setVariant] = useState<ExportVariant>('key')
  const [includeCode, setIncludeCode] = useState(false)
  const [seed] = useState(newSeed)

  const masked = useMemo(() => (study.active ? study.masked : truthMasks(table, study.config, seed)), [study.active, study.masked, table, study.config, seed])
  const model = useMemo(
    () => buildTruthTableModel(table, { variant, masked, expression, includeCode }),
    [table, variant, masked, expression, includeCode],
  )

  return (
    <ExportPanel
      table={model}
      baseName={truthBaseName(variant)}
      controls={
        <>
          <SegmentedToggle<ExportVariant>
            label="As"
            value={variant}
            onChange={setVariant}
            options={[
              { value: 'key', label: 'Answer key', hint: 'Every value filled in' },
              { value: 'worksheet', label: 'Worksheet', hint: 'The cells a student fills in are left blank' },
            ]}
          />
          {variant === 'worksheet' && (
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {masked.size === 0
                ? 'Nothing is blanked: choose what to hide in Study mode.'
                : `Blanks ${masked.size} cell${masked.size === 1 ? '' : 's'} (the Study mode mask).`}
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeCode} onChange={(e) => setIncludeCode(e.target.checked)} />
            Include the expression (Markdown, LaTeX, PNG)
          </label>
        </>
      }
    />
  )
}
