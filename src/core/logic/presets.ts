import manifest from './presets.json'
import { parseProgram } from './parser'

export interface LogicPreset {
  id: string
  title: string
  description: string
  /** Expression source, in the syntax `parseProgram` accepts. */
  source: string
}

/** Validate the manifest once on load: a malformed or unparsable preset is a build-time bug. */
function validate(raw: unknown): LogicPreset[] {
  if (!Array.isArray(raw)) throw new Error('logic presets: expected an array')
  const ids = new Set<string>()
  return raw.map((p: unknown, i) => {
    const o = p as Record<string, unknown>
    for (const k of ['id', 'title', 'description', 'source'] as const) {
      if (typeof o?.[k] !== 'string' || o[k] === '') throw new Error(`logic presets[${i}]: missing "${k}"`)
    }
    const preset = o as unknown as LogicPreset
    if (ids.has(preset.id)) throw new Error(`logic presets: duplicate id "${preset.id}"`)
    ids.add(preset.id)
    try {
      parseProgram(preset.source)
    } catch (e) {
      throw new Error(`logic preset "${preset.id}" does not parse: ${(e as Error).message}`, { cause: e })
    }
    return { id: preset.id, title: preset.title, description: preset.description, source: preset.source }
  })
}

export const logicPresets: readonly LogicPreset[] = validate(manifest)

export const findLogicPreset = (id: string): LogicPreset | undefined => logicPresets.find((p) => p.id === id)
