import { create } from 'zustand'

/** Projector mode is remembered per device, like the theme. */
export const PROJECTOR_KEY = 'tts:projector'
/** The class on <html> that Tailwind's `projector:` variant looks for. */
export const PROJECTOR_CLASS = 'projector'

export function initialProjector(): boolean {
  try {
    return localStorage.getItem(PROJECTOR_KEY) === '1'
  } catch {
    return false // storage unavailable (private mode etc.)
  }
}

interface ProjectorState {
  on: boolean
  toggle(): void
}

export const useProjector = create<ProjectorState>()((set, get) => ({
  on: initialProjector(),
  toggle() {
    const on = !get().on
    try {
      localStorage.setItem(PROJECTOR_KEY, on ? '1' : '0')
    } catch {
      /* ignore: it just won't be remembered */
    }
    set({ on })
  },
}))
