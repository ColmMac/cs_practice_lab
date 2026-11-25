import { useMemo, useState } from 'react'
import { buildTruthTableModel, truthBaseName } from '../../core/export/truthModel'
import type { ExportVariant } from '../../core/export/tableModel'
import { truthMasks, type TruthTable } from '../../core/logic'
import { newSeed } from '../../core/study/rng'
import { ExportPanel, ExportVariantPicker } from '../ui/ExportPanel'
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
          <ExportVariantPicker
            value={variant}
            onChange={setVariant}
            blanked={masked.size}
            nothingBlanked="Nothing is blanked: choose what to hide in Study mode."
          />
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input type="checkbox" checked={includeCode} onChange={(e) => setIncludeCode(e.target.checked)} />
            Include the expression (Markdown, LaTeX, PNG)
          </label>
        </>
      }
    />
  )
}
