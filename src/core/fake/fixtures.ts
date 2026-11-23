import type { FrameInfo, TraceResult, TraceStep, Value } from '../types'

const int = (n: number): Value => ({ k: 'int', v: String(n) })
const moduleFrame: FrameInfo = { id: 0, name: '<module>', depth: 0 }

function step(
  i: number,
  line: number,
  src: string,
  vars: Record<string, Value>,
  written: string[],
  out = '',
): TraceStep {
  return {
    stepIndex: i,
    kind: 'line',
    lineNumber: line,
    lineSource: src,
    frame: moduleFrame,
    callStack: [moduleFrame],
    scopes: [{ frame: moduleFrame, vars }],
    writes: written.map((name) => ({ frameId: 0, name })),
    deletes: [],
    stdoutDelta: out,
    watches: {},
  }
}

/** Hand-built trace for `n = 12; total = 0; total = total + n % 10; print(total)`. */
export const tinyTrace: TraceResult = {
  runId: 'fixture-tiny',
  language: 'python',
  status: 'ok',
  steps: [
    step(0, 1, 'n = 12', { n: int(12) }, ['n']),
    step(1, 2, 'total = 0', { n: int(12), total: int(0) }, ['total']),
    step(2, 3, 'total = total + n % 10', { n: int(12), total: int(2) }, ['total']),
    step(3, 4, 'print(total)', { n: int(12), total: int(2) }, [], '2\n'),
  ],
  variables: [
    { columnId: '<module>:n', scopeName: '<module>', name: 'n', firstStep: 0, ephemeral: false },
    { columnId: '<module>:total', scopeName: '<module>', name: 'total', firstStep: 1, ephemeral: false },
  ],
  functions: [],
  stdout: '2\n',
  stats: { stepsExecuted: 4, durationMs: 1, truncated: false },
  executionKey: 'fixture-tiny',
}
