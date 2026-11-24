import type { ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'danger' | 'toolbar' | 'small'

/** Class strings per variant. Exported so the unit test can pin them: they ARE the design tokens. */
export const BUTTON_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50',
  danger:
    'rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
  toolbar:
    'rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-200 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800',
  small:
    'rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
}

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

export function Button({ variant = 'toolbar', className, type = 'button', ...rest }: Props) {
  return <button type={type} className={className ? `${BUTTON_CLASSES[variant]} ${className}` : BUTTON_CLASSES[variant]} {...rest} />
}
