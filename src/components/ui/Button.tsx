import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'danger' | 'toolbar' | 'small'

/** Class strings per variant. Exported so the unit test can pin them: they ARE the design tokens. */
export const BUTTON_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'rounded bg-accent-fill px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'rounded bg-danger-fill px-3 py-1.5 text-sm font-medium text-white hover:bg-danger-fill-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger-fill',
  toolbar:
    'rounded border border-border px-2 py-1 text-sm hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
  small:
    'rounded border border-border bg-surface-elevated px-2 py-0.5 text-xs font-medium hover:bg-surface-strong focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'toolbar', className, type = 'button', ...rest }: Props) {
  return <button type={type} className={className ? `${BUTTON_CLASSES[variant]} ${className}` : BUTTON_CLASSES[variant]} {...rest} />
}
