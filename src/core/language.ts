import type { Extension } from '@codemirror/state'
import type { TraceRunner } from './runner'
import type { LanguageId, TraceOptions, Value } from './types'

export type ParsedAnswer = { ok: true; value: Value } | { ok: false; raw: string }

export interface Preset {
  id: string
  title: string
  description: string
  code: string
  stdin?: string[]
  suggestedWatches?: string[]
}

export interface LanguageDescriptor {
  id: LanguageId
  label: string
  editorExtension: () => Promise<Extension>
  createRunner: () => TraceRunner
  presets: Preset[]
  /** Python: "[1, 2]", "'hi'", "True", "None" */
  formatValue(v: Value): string
  /** Study Mode: user text → Value, or unparseable. Absent ⇒ Study Mode is unavailable for the language. */
  parseAnswer?(text: string): ParsedAnswer
  /** Sloppy-but-recognisable answers (unquoted words, `true`, `none`): the value they mean and the slip to point out. */
  looseParse?(text: string): { value: Value; slip: string } | null
  defaultOptions?: Partial<TraceOptions>
}
