import { matchingItemId } from '../../core/mastery/mastery'
import type { WatchExpression } from '../../core/types'
import { parseStdin } from '../../store'
import type { Preset } from '../../core/language'

/**
 * The built-in the Example menu names: the one whose program and input are in the editor, with its suggested watches
 * in place. Otherwise '' (the placeholder), so that choosing it again loads it afresh. The watch rule matters on a
 * first visit: the editor starts with the first preset's code but without its watch.
 */
export function shownPresetId(
  workspace: { code: string; stdinText: string; watches: readonly WatchExpression[] },
  presets: readonly Preset[],
): string {
  const id = matchingItemId({ code: workspace.code, stdin: parseStdin(workspace.stdinText) }, presets)
  const suggested = presets.find((p) => p.id === id)?.suggestedWatches ?? []
  return id !== null && suggested.every((expr) => workspace.watches.some((w) => w.expr === expr)) ? id : ''
}
