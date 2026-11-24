import { executionKey } from '../../core/executionKey'
import type {
  FrameInfo,
  ScopeSnapshot,
  StepKind,
  TraceOptions,
  TraceResult,
  TraceStep,
  Value,
  WatchResult,
} from '../../core/types'
import type { WireResult } from './protocol'

const KINDS: Record<string, StepKind> = { c: 'call', l: 'line', r: 'return', x: 'exception' }

/**
 * Turns the tracer's compact delta-encoded wire result into the language-neutral TraceResult.
 * Every step exposes the FULL state of every live frame, but unchanged frames reuse the previous
 * object (structural sharing), so memory stays proportional to the number of changes.
 */
export function materialise(
  wire: WireResult,
  ctx: { runId: string; code: string; options: TraceOptions },
): TraceResult {
  const lines = ctx.code.split('\n')
  const frameInfo = new Map<number, FrameInfo>(wire.frames.map((f) => [f.id, f]))
  const info = (id: number): FrameInfo => frameInfo.get(id) ?? { id, name: '?', depth: 0 }
  const live = new Map<number, Record<string, Value>>()
  // The tracer only sends watch results that CHANGED; every step still exposes all of them.
  let liveWatches: Record<string, WatchResult> = {}

  const steps: TraceStep[] = wire.steps.map((ws) => {
    for (const [fid, name, value] of ws.w ?? []) {
      live.set(fid, { ...(live.get(fid) ?? {}), [name]: value })
    }
    for (const [fid, name] of ws.d ?? []) {
      const next = { ...(live.get(fid) ?? {}) }
      delete next[name]
      live.set(fid, next)
    }
    if (ws.wt) liveWatches = { ...liveWatches, ...ws.wt }
    const callStack = ws.stk.map(info)
    const scopes: ScopeSnapshot[] = callStack.map((frame) => ({ frame, vars: live.get(frame.id) ?? {} }))
    const step: TraceStep = {
      stepIndex: ws.i,
      kind: KINDS[ws.k] ?? 'line',
      lineNumber: ws.ln,
      lineSource: (lines[ws.ln - 1] ?? '').trim(),
      frame: info(ws.f),
      callStack,
      scopes,
      writes: (ws.w ?? []).map(([frameId, name]) => ({ frameId, name })),
      deletes: (ws.d ?? []).map(([frameId, name]) => ({ frameId, name })),
      stdoutDelta: ws.o ?? '',
      watches: liveWatches,
    }
    if (ws.r) step.returnValue = ws.r
    if (ws.x) step.exception = { type: ws.x.t, message: ws.x.m, caught: ws.x.c }
    if (ws.b !== undefined) step.branch = ws.b
    return step
  })

  return {
    runId: ctx.runId,
    language: 'python',
    status: wire.status,
    steps,
    variables: wire.variables,
    functions: wire.functions,
    stdout: wire.stdout,
    error: wire.error ?? undefined,
    inputRequest: wire.inputRequest ?? undefined,
    stats: {
      stepsExecuted: wire.stats.rawSteps,
      durationMs: wire.stats.durationMs,
      truncated: wire.stats.truncated,
    },
    executionKey: executionKey('python', ctx.code, ctx.options),
  }
}
