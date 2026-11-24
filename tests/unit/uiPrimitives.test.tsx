import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Badge, BADGE_TONES } from '../../src/components/ui/Badge'
import { Button, BUTTON_CLASSES } from '../../src/components/ui/Button'
import { Panel } from '../../src/components/ui/Panel'
import { Popover, POPOVER_PANEL } from '../../src/components/ui/Popover'
import { SegmentedToggle } from '../../src/components/ui/SegmentedToggle'
import { TD, TH } from '../../src/components/ui/tableStyles'
import { ToolHeader } from '../../src/components/ui/ToolHeader'

describe('design tokens', () => {
  it('pins the class strings the trace page was built with', () => {
    expect(BUTTON_CLASSES.primary).toContain('bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800')
    expect(BUTTON_CLASSES.danger).toContain('bg-red-600 px-3 py-1.5')
    expect(BUTTON_CLASSES.toolbar).toContain('rounded border border-slate-300 px-2 py-1 text-sm hover:bg-slate-200')
    expect(BUTTON_CLASSES.small).toContain('px-2 py-0.5 text-xs font-medium')
    expect(TH).toBe('border border-slate-300 px-3 py-1.5 text-left font-semibold dark:border-slate-700')
    expect(TD).toBe('border border-slate-300 px-3 py-1 font-mono dark:border-slate-700')
    expect(POPOVER_PANEL).toContain('absolute right-0 z-30 mt-1 w-80 rounded border border-slate-300 bg-white p-3')
  })

  it('every badge tone has a light and a dark colour pair', () => {
    for (const tone of Object.values(BADGE_TONES)) expect(tone).toMatch(/^bg-\S+ text-\S+ dark:bg-\S+ dark:text-\S+$/)
  })
})

describe('primitives', () => {
  it('Button defaults to a non-submitting toolbar button and appends extra classes', () => {
    render(<Button className="extra">Go</Button>)
    const b = screen.getByRole('button', { name: 'Go' })
    expect(b).toHaveAttribute('type', 'button')
    expect(b.className).toBe(`${BUTTON_CLASSES.toolbar} extra`)
  })

  it('Badge is a status region', () => {
    render(<Badge tone="ok">Ready</Badge>)
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
  })

  it('Panel shows its title as a heading', () => {
    render(<Panel title="Inputs">body</Panel>)
    expect(screen.getByRole('heading', { name: 'Inputs' })).toBeInTheDocument()
  })

  it('ToolHeader renders the title and its toolbar', () => {
    render(
      <ToolHeader title="Tool">
        <button type="button">Run</button>
      </ToolHeader>,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Tool' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument()
  })

  it('SegmentedToggle marks the selected option', () => {
    render(<SegmentedToggle label="Mode" value="b" onChange={() => {}} options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]} />)
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'A' })).toHaveAttribute('aria-checked', 'false')
  })

  it('Popover opens on click and closes on Escape', async () => {
    const { default: userEvent } = await import('@testing-library/user-event')
    const user = userEvent.setup()
    render(
      <Popover label="Menu" trigger={(p) => <Button {...p}>Open</Button>}>
        content
      </Popover>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(screen.getByRole('dialog', { name: 'Menu' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
