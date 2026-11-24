import type { LanguageDescriptor } from '../core/language'
import type { LanguageId } from '../core/types'
import { pythonDescriptor } from './python/descriptor'

/** Adding a language = adding one descriptor here. Nothing in core/, store/ or components/ changes. */
export const languages: Partial<Record<LanguageId, LanguageDescriptor>> = {
  python: pythonDescriptor,
}

export function getLanguage(id: LanguageId): LanguageDescriptor {
  const d = languages[id]
  if (!d) throw new Error(`Language not supported yet: ${id}`)
  return d
}
