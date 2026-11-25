import { PencilLine } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { ICON_BEFORE } from './icons'

const BASE =
  'rounded border border-accent-fill px-3 py-1.5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className' | 'children' | 'aria-pressed'> {
  on: boolean
}

/** The prominent Study mode switch, outlined when off and filled when on. Each tool decides what it does. */
export function StudyModeButton({ on, ...rest }: Props) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`${BASE} ${on ? 'bg-accent-fill text-on-accent hover:bg-accent-fill-hover' : 'text-accent hover:bg-accent-soft'}`}
      {...rest}
    >
      <PencilLine aria-hidden="true" className={ICON_BEFORE} />
      Study mode{on ? ': on' : ''}
    </button>
  )
}
