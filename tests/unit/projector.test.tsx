import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initialProjector, PROJECTOR_KEY, useProjector } from '../../src/components/ui/projector'
import { ProjectorToggle } from '../../src/components/ui/ProjectorToggle'
import { useProjectorClass } from '../../src/components/ui/useProjectorClass'

const html = () => document.documentElement.classList

/** Stands in for the trace page: it owns the <html> class while mounted. */
function Page() {
  useProjectorClass()
  return <ProjectorToggle />
}

beforeEach(() => {
  localStorage.clear()
  useProjector.setState({ on: false })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('projector mode', () => {
  it('is off unless this device turned it on', () => {
    expect(initialProjector()).toBe(false)
    localStorage.setItem(PROJECTOR_KEY, 'yes please')
    expect(initialProjector()).toBe(false)
    localStorage.setItem(PROJECTOR_KEY, '1')
    expect(initialProjector()).toBe(true)
  })

  it('the toggle is a pressed button that sets the <html> class and remembers the choice', async () => {
    const user = userEvent.setup()
    render(<Page />)
    const button = screen.getByRole('button', { name: /projector/i })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(html().contains('projector')).toBe(false)
    await user.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(html().contains('projector')).toBe(true)
    expect(localStorage.getItem(PROJECTOR_KEY)).toBe('1')
    await user.click(button)
    expect(html().contains('projector')).toBe(false)
    expect(localStorage.getItem(PROJECTOR_KEY)).toBe('0')
  })

  it('leaving the page removes the class; coming back restores it', () => {
    useProjector.setState({ on: true })
    const first = render(<Page />)
    expect(html().contains('projector')).toBe(true)
    first.unmount()
    expect(html().contains('projector')).toBe(false)
    render(<Page />)
    expect(html().contains('projector')).toBe(true)
  })

  it('still works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('full')
    })
    expect(initialProjector()).toBe(false)
    const user = userEvent.setup()
    render(<Page />)
    await user.click(screen.getByRole('button', { name: /projector/i }))
    expect(html().contains('projector')).toBe(true)
  })
})
