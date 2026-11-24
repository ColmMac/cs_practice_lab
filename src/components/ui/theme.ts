import { create } from 'zustand'

export type Theme = 'light' | 'dark'

/** Same key the trace store used, so existing users keep their choice. */
export const THEME_KEY = 'tts:theme'

export function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable (private mode etc.) */
  }
  try {
    if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    /* ignore */
  }
  return 'light'
}

/** Reflect the theme on <html> (Tailwind's `dark` variant) and remember it. */
export function applyTheme(theme: Theme, persist = true) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  if (!persist) return
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    /* ignore */
  }
}

interface ThemeState {
  theme: Theme
  toggle(): void
}

export const useTheme = create<ThemeState>()((set, get) => ({
  theme: initialTheme(),
  toggle() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    set({ theme })
  },
}))

/** Called once from main.tsx before the first render. Does not write storage (nothing was chosen yet). */
export function bootTheme() {
  applyTheme(useTheme.getState().theme, false)
}
