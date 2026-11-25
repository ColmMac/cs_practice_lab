import { Button } from './Button'
import { useProjector } from './projector'

/** The same filled-emerald "on" look as the Study mode switch. `!` beats the toolbar variant's own colours. */
const ON = 'border-emerald-700! bg-emerald-700 text-white hover:bg-emerald-800! dark:border-emerald-700! dark:hover:bg-emerald-800!'

export function ProjectorToggle() {
  const on = useProjector((s) => s.on)
  const toggle = useProjector((s) => s.toggle)
  return (
    <Button
      aria-pressed={on}
      onClick={toggle}
      className={on ? ON : undefined}
      title={on ? 'Leave projector mode' : 'Bigger text and fewer panels, for showing on a screen'}
    >
      📽 Projector{on ? ': on' : ''}
    </Button>
  )
}
