import { PageMeta } from '../../app/PageMeta'
import { toolDescription } from '../../app/tools'
import { findLogicPreset, logicPresets } from '../../core/logic'
import { Badge } from '../ui/Badge'
import { Panel } from '../ui/Panel'
import { SegmentedToggle } from '../ui/SegmentedToggle'
import { ToolHeader } from '../ui/ToolHeader'
import { ToolWorkspace } from '../ui/ToolWorkspace'
import { Button } from '../ui/Button'
import { ExportUnavailable } from '../ui/ExportPanel'
import { ExpressionInput } from './ExpressionInput'
import { TruthExport } from './TruthExport'
import { TruthStudyPanel } from './TruthStudyPanel'
import { TruthTableView } from './TruthTableView'
import { useTruthStudy } from './useTruthStudy'
import { CUSTOM, useTruthPage } from './useTruthPage'
import { PencilLine } from 'lucide-react'
import { ICON_BEFORE } from '../ui/icons'

export function TruthTablePage() {
  const s = useTruthPage()
  const preset = findLogicPreset(s.selectValue)
  const study = useTruthStudy(s.table, s.notation)

  return (
    <>
      <PageMeta title="Truth tables" description={toolDescription('/truth-tables')} />
      <ToolWorkspace>
        <ToolHeader title="Truth tables">
          <label className="flex items-center gap-2 text-xs">
            <span className="text-slate-600 dark:text-slate-400">Example</span>
            <select
              value={s.selectValue}
              onChange={(e) => e.target.value !== CUSTOM && s.choosePreset(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <option value={CUSTOM}>Custom expression</option>
              {logicPresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          <SegmentedToggle
            label="Values"
            value={s.notation}
            onChange={s.setNotation}
            options={[
              { value: '01', label: '0 / 1' },
              { value: 'TF', label: 'T / F' },
            ]}
          />
          <SegmentedToggle
            label="Intermediate columns"
            value={s.intermediates ? 'on' : 'off'}
            onChange={(v) => s.setIntermediates(v === 'on')}
            options={[
              { value: 'off', label: 'Off', hint: 'Inputs and outputs only' },
              { value: 'on', label: 'On', hint: 'Add a column for each sub-expression' },
            ]}
          />
          {s.table && s.parsed.ok ? (
            <TruthExport table={s.table} expression={s.parsedSource} study={study} />
          ) : (
            <ExportUnavailable reason="Enter a valid expression first" />
          )}
          <Button
            aria-pressed={study.active}
            disabled={!study.active && !s.table}
            title={study.active ? 'Leave study mode' : 'Hide the answers and fill the truth table in yourself.'}
            onClick={study.active ? study.exit : study.start}
            className={study.active ? '!border-accent-fill !bg-accent-fill !text-on-accent hover:!bg-accent-fill-hover' : '!border-accent-fill !text-accent'}
          >
            <PencilLine aria-hidden="true" className={ICON_BEFORE} />
            Study mode{study.active ? ': on' : ''}
          </Button>
        </ToolHeader>
        <main className="grid flex-1 content-start gap-4 p-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div className="flex flex-col gap-3">
            <ExpressionInput value={s.expr} onChange={s.edit} parsed={s.parsed} parsedSource={s.parsedSource} />
            {preset && <p className="text-sm text-slate-700 dark:text-slate-300">{preset.description}</p>}
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            {s.table && s.parsed.ok ? (
              <>
                <Panel title="How this was read">
                  <ul className="p-3 font-mono text-sm" aria-label="Fully bracketed reading">
                    {s.bracketed.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </Panel>
                {s.table.equivalent && <Badge tone="ok">All outputs are equivalent: they agree on every row.</Badge>}
                {study.active && <TruthStudyPanel study={study} />}
                <TruthTableView table={study.table ?? s.table} study={study} />
              </>
            ) : (
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {s.parsedSource.trim() ? 'Fix the error to see the table.' : 'Type an expression, or pick an example.'}
              </p>
            )}
          </div>
        </main>
      </ToolWorkspace>
    </>
  )
}
