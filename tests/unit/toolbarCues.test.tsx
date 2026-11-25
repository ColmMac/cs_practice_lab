import { describe, expect, it } from 'vitest'
import { shownPresetId } from '../../src/components/layout/shownPreset'
import { getLanguage } from '../../src/languages/registry'

const presets = getLanguage('python').presets
const watch = (expr: string) => ({ id: 'w1', expr, scope: { kind: 'current' as const }, enabled: true })
const workspaceFor = (id: string) => {
  const p = presets.find((x) => x.id === id)!
  return { code: p.code, stdinText: (p.stdin ?? []).join('\n'), watches: (p.suggestedWatches ?? []).map(watch) }
}

describe('the preset the Example menu names', () => {
  it('names every built-in once it is loaded', () => {
    for (const p of presets) expect(shownPresetId(workspaceFor(p.id), presets)).toBe(p.id)
  })

  it('goes back to the placeholder when the program is edited', () => {
    const w = workspaceFor('digit-sum')
    expect(shownPresetId({ ...w, code: `${w.code}\nprint(1)` }, presets)).toBe('')
  })

  it('stays on the placeholder while a suggested watch is missing, so choosing the preset adds it', () => {
    expect(shownPresetId({ ...workspaceFor('linear-search'), watches: [] }, presets)).toBe('')
  })
})
