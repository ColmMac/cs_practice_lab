import { useId, type ReactNode } from 'react'
import { usePopover } from './usePopover'

/** Class string of the floating panel (shared by Export and Share). */
export const POPOVER_PANEL =
  'absolute right-0 z-30 mt-1 w-80 rounded border border-border bg-surface-elevated p-3 text-sm shadow-sm'

interface Props {
  /** Accessible name of the dialog. */
  label: string
  /** Renders the trigger; spread `triggerProps` onto a button. */
  trigger: (p: { 'aria-haspopup': 'dialog'; 'aria-expanded': boolean; 'aria-controls': string | undefined; onClick: () => void }) => ReactNode
  children: ReactNode
  onToggle?: (open: boolean) => void
}

/** A trigger plus a dialog panel that closes on Escape and on a click outside. */
export function Popover({ label, trigger, children, onToggle }: Props) {
  const { open, setOpen, ref } = usePopover()
  const panelId = useId()
  return (
    <div ref={ref} className="relative">
      {trigger({
        'aria-haspopup': 'dialog',
        'aria-expanded': open,
        'aria-controls': open ? panelId : undefined,
        onClick: () => {
          onToggle?.(!open)
          setOpen(!open)
        },
      })}
      {open && (
        <div id={panelId} role="dialog" aria-label={label} className={POPOVER_PANEL}>
          {children}
        </div>
      )}
    </div>
  )
}
