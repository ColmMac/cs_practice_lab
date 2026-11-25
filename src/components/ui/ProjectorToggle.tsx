import { Button } from './Button'
import { useProjector } from './projector'
import { Presentation } from 'lucide-react'
import { ICON_BEFORE } from './icons'

/** The same filled-emerald "on" look as the Study mode switch. `!` beats the toolbar variant's own colours. */
const ON = 'border-accent-fill! bg-accent-fill text-on-accent hover:bg-accent-fill-hover!'

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
      <Presentation aria-hidden="true" className={ICON_BEFORE} />
      Projector{on ? ': on' : ''}
    </Button>
  )
}
