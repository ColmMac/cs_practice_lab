/** Answer boxes in the table, in DOM order. */
export const studyInputs = (root: ParentNode): HTMLInputElement[] =>
  Array.from(root.querySelectorAll<HTMLInputElement>('input[data-study-key]'))

const columnIndex = (input: HTMLInputElement): number => (input.closest('td') as HTMLTableCellElement | null)?.cellIndex ?? 0

/**
 * The next answer box for keyboard navigation: down/up within the column; past the end of a column, the
 * first (or last) box of the neighbouring column. Null when there is nowhere left to go.
 */
export function nextStudyInput(root: ParentNode, from: HTMLInputElement, delta: 1 | -1): HTMLInputElement | null {
  const all = studyInputs(root)
  const col = columnIndex(from)
  const inColumn = all.filter((i) => columnIndex(i) === col)
  const target = inColumn[inColumn.indexOf(from) + delta]
  if (target) return target

  const columns = [...new Set(all.map(columnIndex))].sort((a, b) => a - b)
  const neighbour = columns[columns.indexOf(col) + delta]
  if (neighbour === undefined) return null
  const list = all.filter((i) => columnIndex(i) === neighbour)
  return (delta > 0 ? list[0] : list[list.length - 1]) ?? null
}

/**
 * Whether `from` is the last thing Tab would stop on inside `root`. Not just the last answer box: while cells are
 * being hand-picked, "Blank this" buttons can follow it and must stay reachable.
 */
export function isLastTabStop(root: ParentNode, from: HTMLElement): boolean {
  const stops = root.querySelectorAll('input:not([tabindex="-1"]):not(:disabled), button:not([tabindex="-1"]):not(:disabled)')
  return stops[stops.length - 1] === from
}

export function focusInput(el: HTMLElement | null): boolean {
  if (!el) return false
  el.focus()
  el.scrollIntoView?.({ block: 'nearest' })
  return true
}
