import { Button } from './Button'
import { useTheme } from './theme'
import { Moon, Sun } from 'lucide-react'
import { ICON_BEFORE } from './icons'

export function ThemeToggle() {
  const theme = useTheme((s) => s.theme)
  const toggle = useTheme((s) => s.toggle)
  const Icon = theme === 'dark' ? Sun : Moon
  return (
    <Button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      <Icon aria-hidden="true" className={ICON_BEFORE} />
      {theme === 'dark' ? 'Light' : 'Dark'}
    </Button>
  )
}
