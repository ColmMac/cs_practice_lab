import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, bootTheme, initialTheme, THEME_KEY, useTheme } from '../../src/components/ui/theme'
import { ThemeToggle } from '../../src/components/ui/ThemeToggle'

function mockMedia(dark: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: dark && q.includes('dark'), media: q }))
}

describe('theme module', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.classList.remove('dark')
    mockMedia(false)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prefers the stored theme', () => {
    localStorage.setItem(THEME_KEY, 'dark')
    mockMedia(false)
    expect(initialTheme()).toBe('dark')
  })

  it('falls back to the media query, then light', () => {
    mockMedia(true)
    expect(initialTheme()).toBe('dark')
    mockMedia(false)
    expect(initialTheme()).toBe('light')
  })

  it('ignores junk in storage', () => {
    localStorage.setItem(THEME_KEY, 'purple')
    expect(initialTheme()).toBe('light')
  })

  it('survives storage throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(initialTheme()).toBe('light')
    expect(() => applyTheme('dark')).not.toThrow()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('uses the same storage key as before (tts:theme)', () => {
    expect(THEME_KEY).toBe('tts:theme')
  })

  it('bootTheme applies the class without writing storage', () => {
    useTheme.setState({ theme: 'dark' })
    bootTheme()
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
  })

  it('toggle flips the class and persists', async () => {
    useTheme.setState({ theme: 'light' })
    bootTheme()
    render(<ThemeToggle />)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(useTheme.getState().theme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem(THEME_KEY)).toBe('dark')
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeTruthy()
    act(() => useTheme.getState().toggle())
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
