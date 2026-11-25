import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  buildTruthTable,
  findLogicPreset,
  LogicError,
  logicPresets,
  parseProgram,
  print,
  type Program,
  type TruthNotation,
} from '../../core/logic'
import { sanitiseExpr } from '../../core/logic/sanitise'

export const LAST_KEY = 'hub:truth:last'
export const DEBOUNCE_MS = 250
export const CUSTOM = 'custom'

function readLast(): string {
  try {
    return sanitiseExpr(localStorage.getItem(LAST_KEY))
  } catch {
    return ''
  }
}

function writeLast(expr: string) {
  try {
    localStorage.setItem(LAST_KEY, expr)
  } catch {
    /* storage unavailable: the page still works */
  }
}

/** Initial source: ?preset=, then ?expr=, then the last expression, then the first preset. */
function initialExpr(params: URLSearchParams): string {
  const preset = findLogicPreset(params.get('preset') ?? '')
  if (preset) return preset.source
  const fromUrl = sanitiseExpr(params.get('expr'))
  if (fromUrl.trim()) return fromUrl
  const last = readLast()
  return last.trim() ? last : logicPresets[0]!.source
}

export type Parsed = { ok: true; program: Program } | { ok: false; error: LogicError | null }

export function parseSource(src: string): Parsed {
  try {
    return { ok: true, program: parseProgram(src) }
  } catch (e) {
    return { ok: false, error: e instanceof LogicError ? e : null }
  }
}

/** All the Truth Table page state: the expression, its (debounced) parse, the options and the URL. */
export function useTruthPage() {
  const [params, setParams] = useSearchParams()
  const [expr, setExpr] = useState(() => initialExpr(params))
  const [debounced, setDebounced] = useState(expr)
  const [notation, setNotation] = useState<TruthNotation>('01')
  const [intermediates, setIntermediates] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(expr), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [expr])

  // Keep the URL and the remembered expression in step with what is on screen.
  const presetId = logicPresets.find((p) => p.source === debounced)?.id
  // A LAYOUT effect: a passive one can still be pending when the next nav link is clicked, and then overwrites it.
  useLayoutEffect(() => {
    setParams(presetId ? { preset: presetId } : debounced.trim() ? { expr: debounced } : {}, { replace: true })
    if (debounced.trim()) writeLast(debounced)
  }, [debounced, presetId, setParams])

  const parsed = useMemo(() => parseSource(debounced), [debounced])
  const table = useMemo(
    () => (parsed.ok ? buildTruthTable(parsed.program, { intermediates, notation }) : null),
    [parsed, intermediates, notation],
  )
  const bracketed = useMemo(
    () => (parsed.ok ? parsed.program.outputs.map((o) => `${o.name} = ${print(o.expr, 'words', true)}`) : []),
    [parsed],
  )

  const choosePreset = (id: string) => {
    const p = findLogicPreset(id)
    if (p) {
      setExpr(p.source)
      setDebounced(p.source)
    }
  }

  return {
    expr,
    edit: (v: string) => setExpr(sanitiseExpr(v)),
    // The select follows the live text, so it never claims a preset the box no longer holds.
    selectValue: logicPresets.find((p) => p.source === expr)?.id ?? CUSTOM,
    choosePreset,
    /** The text `parsed` was computed from; error positions index into this. */
    parsedSource: debounced,
    parsed,
    table,
    bracketed,
    notation,
    setNotation,
    intermediates,
    setIntermediates,
  }
}
