import type { Preset } from '../../core/language'
import manifest from './presets/presets.json'

// Preset code lives in real .py files (presets/*.py) so the Python fixture generator and the app read
// the same source. `presets.json` holds the metadata and fixes the order.
const sources = import.meta.glob('./presets/*.py', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

interface ManifestEntry {
  id: string
  title: string
  description: string
  file: string
  stdin?: string[]
  suggestedWatches?: string[]
}

export const pythonPresets: Preset[] = (manifest as ManifestEntry[]).map((m) => {
  const code = sources[`./presets/${m.file}`]
  if (code === undefined) throw new Error(`Preset file missing: presets/${m.file}`)
  return { id: m.id, title: m.title, description: m.description, code, stdin: m.stdin, suggestedWatches: m.suggestedWatches }
})
