import type { TraceOptions, TraceResult } from '../../src/core/types'
import { DEFAULT_TRACE_OPTIONS } from '../../src/core/types'
import { materialise } from '../../src/languages/python/materialise'
import type { WireResult } from '../../src/languages/python/protocol'
import digitSum from '../fixtures/wire/digit-sum.json'
import factorial from '../fixtures/wire/factorial.json'
import infiniteLoop from '../fixtures/wire/infinite-loop.json'
import needsInput from '../fixtures/wire/needs-input.json'
import syntaxError from '../fixtures/wire/syntax-error.json'
import zeroDivision from '../fixtures/wire/zero-division.json'

interface Fixture {
  code: string
  options: Partial<TraceOptions>
  wire: unknown
}

/** Real tracer.py output (tests/tracer/make_wire_fixtures.py) run through the real materialiser. */
function load(name: string, f: Fixture): TraceResult {
  return materialise(f.wire as WireResult, {
    runId: name,
    code: f.code,
    options: { ...DEFAULT_TRACE_OPTIONS, ...f.options },
  })
}

export const traces = {
  digitSum: load('digit-sum', digitSum as Fixture),
  factorial: load('factorial', factorial as Fixture),
  zeroDivision: load('zero-division', zeroDivision as Fixture),
  infiniteLoop: load('infinite-loop', infiniteLoop as Fixture),
  syntaxError: load('syntax-error', syntaxError as Fixture),
  needsInput: load('needs-input', needsInput as Fixture),
}
