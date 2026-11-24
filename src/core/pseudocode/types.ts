/** A program rewritten in an exam board's pseudocode (a reading aid: nothing here is ever executed). */
export type ExamDialect = 'aqa' | 'ocr' | 'sqa'

export const EXAM_DIALECTS: readonly ExamDialect[] = ['aqa', 'ocr', 'sqa']

export interface PseudoLine {
  text: string
  indent: number
  /** 1-based source line this came from; null for closers (ENDWHILE, next i) and bare ELSE */
  sourceLine: number | null
  /** No exam equivalent: normally the source is shown as written, with a marker */
  unsupported?: boolean
  /** Why it is marked, when the reason is more specific than "no equivalent" */
  note?: string
}

export type PseudoResult =
  | { ok: true; dialect: ExamDialect; lines: PseudoLine[] }
  | { ok: false; message: string; line?: number }
