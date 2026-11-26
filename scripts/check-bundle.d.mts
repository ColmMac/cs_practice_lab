// Types for check-bundle.mjs, which stays plain JavaScript so that CI can run it with Node alone.
export interface ChunkSize {
  file: string
  bytes: number
  gzipBytes: number
}

export interface BudgetGroup {
  name: string
  type: string
  chunks: string[]
  gzipKb: number
  firstLoad?: boolean
}

export interface Budget {
  maxChunkMinifiedKb: number
  groups: BudgetGroup[]
}

export interface BundleResult {
  rows: { name: string; gzipBytes: number; budgetKb: number; over: boolean }[]
  others: (ChunkSize & { name: string; type: string })[]
  failures: string[]
}

export function parseChunk(file: string): { name: string; type: string } | null
export function htmlScripts(html: string): string[]
export function checkBundle(chunks: ChunkSize[], budget: Budget, loadedByHtml: string[]): BundleResult
export function formatReport(result: BundleResult): string
