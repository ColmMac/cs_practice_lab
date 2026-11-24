import { Button } from './Button'
import { useTheme } from './theme'

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  return (
    <Button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? '☀ Light' : '☾ Dark'}
    </Button>
  )
}
