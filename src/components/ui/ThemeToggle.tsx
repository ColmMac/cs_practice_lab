import { useTheme } from './theme'

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-200 dark:border-slate-700 dark:hover:bg-slate-800"
    >
      {theme === 'dark' ? '☀ Light' : '☾ Dark'}
    </button>
  )
}
