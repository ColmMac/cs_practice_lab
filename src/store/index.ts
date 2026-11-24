import { create } from 'zustand'
import type { RunnerStatus, TraceRunner } from '../core/runner'
import { DEFAULT_TRACE_OPTIONS, type LanguageId, type TraceOptions, type TraceResult } from '../core/types'
import { getLanguage } from '../languages/registry'
import { getRunner } from './runner'

export type Theme = 'light' | 'dark'

interface AppState {
  language: LanguageId
  code: string
  stdinText: string
  theme: Theme

  runnerStatus: RunnerStatus
  running: boolean
  result: TraceResult | null
  /** Code that produced `result`; the editor differs from it ⇒ the table is stale. */
  ranCode: string | null

  init(): void
  setCode(code: string): void
  setStdinText(text: string): void
  loadPreset(id: string): void
  run(): Promise<void>
  cancel(): void
  toggleTheme(): void
}

/** One entry per input() call; a single trailing newline is not an extra (empty) input. */
export function parseStdin(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('tts:theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* storage unavailable (private mode etc.) */
  }
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem('tts:theme', theme)
  } catch {
    /* ignore */
  }
}

const firstPreset = getLanguage('python').presets[0]
let runToken = 0
let boundRunner: TraceRunner | null = null

export const useStore = create<AppState>((set, get) => ({
  language: 'python',
  code: firstPreset?.code ?? '',
  stdinText: '',
  theme: initialTheme(),

  runnerStatus: { state: 'uninitialised' },
  running: false,
  result: null,
  ranCode: null,

  init() {
    applyTheme(get().theme)
    const runner = getRunner(get().language)
    if (runner === boundRunner) return // StrictMode double-mount / repeated calls
    boundRunner = runner
    set({ runnerStatus: runner.getStatus() })
    runner.onStatus((runnerStatus) => set({ runnerStatus }))
    runner.init().catch(() => {}) // failure is surfaced through runnerStatus
  },

  setCode: (code) => set({ code }),
  setStdinText: (stdinText) => set({ stdinText }),

  loadPreset(id) {
    const p = getLanguage(get().language).presets.find((x) => x.id === id)
    if (p) set({ code: p.code, stdinText: (p.stdin ?? []).join('\n') })
  },

  async run() {
    const { language, code, stdinText, running } = get()
    if (running) return
    const token = ++runToken
    const runner = getRunner(language)
    const options: TraceOptions = {
      ...DEFAULT_TRACE_OPTIONS,
      ...getLanguage(language).defaultOptions,
      stdin: parseStdin(stdinText),
    }
    set({ running: true })
    try {
      const result = await runner.runTrace(code, options)
      if (token === runToken) set({ result, ranCode: code, running: false })
    } catch {
      // the runtime itself is broken; runnerStatus already says so
      if (token === runToken) set({ running: false })
    }
  },

  cancel() {
    runToken++
    getRunner(get().language).cancel()
    set({ running: false })
  },

  toggleTheme() {
    const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
    applyTheme(theme)
    set({ theme })
  },
}))
