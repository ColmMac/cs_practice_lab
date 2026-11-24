import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { watchColumnId } from '../core/derive/columns'
import type { RunnerStatus, TraceRunner } from '../core/runner'
import { buildShareUrl, decodeShare, parseShareHash } from '../core/share/urlState'
import { DEFAULT_TRACE_OPTIONS, type TraceOptions, type TraceResult, type WatchExpression } from '../core/types'
import { defaultWorkspace, LIMITS, type Workspace } from '../core/workspace'
import { getLanguage } from '../languages/registry'
import { mergeWorkspace, migrateWorkspace, safeStorage, STORAGE_KEY, STORAGE_VERSION } from './persistence'
import { getRunner } from './runner'

export type Theme = 'light' | 'dark'

interface AppState extends Workspace {
  theme: Theme

  runnerStatus: RunnerStatus
  running: boolean
  result: TraceResult | null
  /** What produced `result` (code, inputs, watches, options); if the current signature differs, the table is stale. */
  ranSig: string | null

  /** stepIndex of the table row under the mouse / focused, and of the clicked row. */
  hoverStep: number | null
  selectedStep: number | null

  /** Validation message per watch id (from the Python side), shown under the watch. */
  watchErrors: Record<string, string>

  /**
   * Set while a shared workspace is loaded but not yet kept: `backup` is the user's own workspace, which
   * stays what gets persisted until they choose. `invalid` flags an unusable #s= link.
   */
  shared: { backup: Workspace } | null
  sharedLinkInvalid: boolean

  init(): void
  setCode(code: string): void
  setStdinText(text: string): void
  loadPreset(id: string): void
  run(): Promise<void>
  cancel(): void
  answerInput(text: string): Promise<void>
  setGranularity(g: Workspace['granularity']): void
  setDisplayStyle(d: Workspace['displayStyle']): void
  setHoverStep(i: number | null): void
  selectStep(i: number | null): void
  toggleTheme(): void

  // column manager
  toggleColumn(id: string): void
  setColumnOrder(ids: string[]): void
  resetColumns(): void
  setShowEphemeral(on: boolean): void
  setShowCallables(on: boolean): void

  /** Drop a queued "re-run soon" (it belonged to a workspace that has just been replaced). */
  cancelScheduledRerun(): void

  // watches
  addWatch(expr?: string): string | null
  updateWatch(id: string, patch: Partial<Pick<WatchExpression, 'expr' | 'label' | 'scope' | 'enabled'>>): void
  removeWatch(id: string): void
  validateWatch(id: string): Promise<void>

  // sharing
  openSharedFromHash(): void
  shareLink(): { url: string; length: number; tooLong: boolean }
  keepShared(): void
  discardShared(): void
  dismissInvalidLink(): void
}

/** One entry per input() call; a single trailing newline is not an extra (empty) input. */
export function parseStdin(text: string): string[] {
  if (text === '') return []
  return text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n')
}

/** The part of the state that is "my workspace" (what is persisted and shared). */
export function workspaceOf(s: Workspace): Workspace {
  return {
    language: s.language,
    code: s.code,
    stdinText: s.stdinText,
    granularity: s.granularity,
    displayStyle: s.displayStyle,
    hiddenColumns: s.hiddenColumns,
    columnOrder: s.columnOrder,
    showEphemeral: s.showEphemeral,
    showCallables: s.showCallables,
    watches: s.watches,
  }
}

/** Everything that changes what the program records. Different signature ⇒ the shown table is stale. */
export function runSignature(s: Pick<Workspace, 'code' | 'stdinText' | 'watches' | 'showCallables'>): string {
  return JSON.stringify([
    s.code,
    s.stdinText,
    s.showCallables,
    s.watches.filter((w) => w.enabled).map((w) => [w.id, w.expr, w.scope]),
  ])
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

function clearShareHash() {
  try {
    history.replaceState(null, '', location.pathname + location.search)
  } catch {
    /* ignore */
  }
}

/** A copy of `record` without `key`. */
function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...record }
  delete copy[key]
  return copy
}

let watchCounter = 0
const newWatchId = (taken: Set<string>) => {
  let id: string
  do id = `w${Date.now().toString(36)}${(watchCounter++).toString(36)}`
  while (taken.has(id))
  return id
}

const firstPreset = getLanguage('python').presets[0]
let runToken = 0
let boundRunner: TraceRunner | null = null
let rerunTimer: ReturnType<typeof setTimeout> | undefined
const validationToken = new Map<string, number>()

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      /** Re-run shortly after an edit that changes what the program records (watches, "show functions"). */
      const scheduleRerun = () => {
        clearTimeout(rerunTimer)
        rerunTimer = setTimeout(() => {
          const s = get()
          if (s.result && !s.running) void s.run()
        }, 500)
      }

      return {
        ...defaultWorkspace(firstPreset?.code ?? '', (firstPreset?.stdin ?? []).join('\n')),
        theme: initialTheme(),

        runnerStatus: { state: 'uninitialised' },
        running: false,
        result: null,
        ranSig: null,
        hoverStep: null,
        selectedStep: null,
        watchErrors: {},
        shared: null,
        sharedLinkInvalid: false,

        init() {
          applyTheme(get().theme)

          get().openSharedFromHash()

          const runner = getRunner(get().language)
          if (runner === boundRunner) return // StrictMode double-mount / repeated calls
          boundRunner = runner
          set({ runnerStatus: runner.getStatus() })
          runner.onStatus((runnerStatus) => set({ runnerStatus }))
          runner
            .init()
            .then(() => {
              const s = get()
              if (!s.shared && s.code.trim() !== '') void s.run() // bring back the last table; own code only
            })
            .catch(() => {}) // failure is surfaced through runnerStatus
        },

        setCode: (code) => set({ code }),
        setStdinText: (stdinText) => set({ stdinText }),

        loadPreset(id) {
          const p = getLanguage(get().language).presets.find((x) => x.id === id)
          if (!p) return
          clearTimeout(rerunTimer)
          const taken = new Set<string>()
          const watches = (p.suggestedWatches ?? []).map((expr) => {
            const wid = newWatchId(taken)
            taken.add(wid)
            return { id: wid, expr, scope: { kind: 'current' as const }, enabled: true }
          })
          // a new program: column ids from the old one no longer apply
          set({
            code: p.code,
            stdinText: (p.stdin ?? []).join('\n'),
            watches,
            hiddenColumns: defaultWorkspace().hiddenColumns,
            columnOrder: [],
            watchErrors: {},
          })
          if (watches.length) watches.forEach((w) => void get().validateWatch(w.id))
        },

        async run() {
          const { language, code, stdinText, running, watches, showCallables } = get()
          if (running) return
          const token = ++runToken
          const runner = getRunner(language)
          const options: TraceOptions = {
            ...DEFAULT_TRACE_OPTIONS,
            ...getLanguage(language).defaultOptions,
            stdin: parseStdin(stdinText),
            watches,
            showCallables,
          }
          const sig = runSignature(get())
          set({ running: true })
          try {
            const result = await runner.runTrace(code, options)
            if (token === runToken) set({ result, ranSig: sig, running: false, hoverStep: null, selectedStep: null })
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

        async answerInput(text) {
          const base = get().stdinText.replace(/\r\n/g, '\n').replace(/\n+$/, '')
          set({ stdinText: base === '' ? text : `${base}\n${text}` })
          await get().run()
        },

        setGranularity: (granularity) => set({ granularity }),
        setDisplayStyle: (displayStyle) => set({ displayStyle }),
        setHoverStep: (hoverStep) => set({ hoverStep }),
        selectStep: (i) => set((s) => ({ selectedStep: s.selectedStep === i ? null : i })),

        toggleTheme() {
          const theme: Theme = get().theme === 'dark' ? 'light' : 'dark'
          applyTheme(theme)
          set({ theme })
        },

        // ── column manager ──
        toggleColumn: (id) =>
          set((s) => ({
            hiddenColumns: s.hiddenColumns.includes(id) ? s.hiddenColumns.filter((x) => x !== id) : [...s.hiddenColumns, id],
          })),
        setColumnOrder: (columnOrder) => set({ columnOrder }),
        resetColumns: () => set({ hiddenColumns: defaultWorkspace().hiddenColumns, columnOrder: [], showEphemeral: false }),
        setShowEphemeral: (showEphemeral) => set({ showEphemeral }),
        setShowCallables(showCallables) {
          set({ showCallables })
          scheduleRerun() // functions/modules are hidden when the trace is recorded, so it must be recorded again
        },

        cancelScheduledRerun: () => clearTimeout(rerunTimer),

        // ── watches ──
        addWatch(expr = '') {
          const { watches } = get()
          if (watches.length >= LIMITS.watches) return null
          const id = newWatchId(new Set(watches.map((w) => w.id)))
          set({ watches: [...watches, { id, expr, scope: { kind: 'current' }, enabled: true }] })
          if (expr) void get().validateWatch(id)
          return id
        },

        updateWatch(id, patch) {
          set((s) => ({ watches: s.watches.map((w) => (w.id === id ? { ...w, ...patch } : w)) }))
          if (patch.expr !== undefined) void get().validateWatch(id)
          else if (patch.scope !== undefined || patch.enabled !== undefined) scheduleRerun()
        },

        removeWatch(id) {
          set((s) => ({
            watches: s.watches.filter((w) => w.id !== id),
            watchErrors: without(s.watchErrors, id),
            hiddenColumns: s.hiddenColumns.filter((c) => c !== watchColumnId(id)),
            columnOrder: s.columnOrder.filter((c) => c !== watchColumnId(id)),
          }))
          scheduleRerun()
        },

        async validateWatch(id) {
          const w = get().watches.find((x) => x.id === id)
          if (!w) return
          const token = (validationToken.get(id) ?? 0) + 1
          validationToken.set(id, token)
          const runner = getRunner(get().language)
          const res = runner.validateWatch ? await runner.validateWatch(w.expr) : { ok: true as const }
          // ignore answers for an expression that has since been edited again
          if (validationToken.get(id) !== token || get().watches.find((x) => x.id === id)?.expr !== w.expr) return
          set((s) => ({
            watchErrors: res.ok ? without(s.watchErrors, id) : { ...s.watchErrors, [id]: res.message },
          }))
          if (res.ok) scheduleRerun() // a valid expression: show its column
        },

        // ── sharing ──
        /**
         * A #s= link loads into the workspace for review. The user's own workspace is kept aside and stays
         * the persisted one until they Keep or Discard. The shared code is NEVER run automatically.
         * Called on startup AND on `hashchange` (pasting a link into a tab that already has the app open
         * only changes the fragment; the page doesn't reload).
         */
        openSharedFromHash() {
          const payload = parseShareHash(location.hash)
          if (!payload) return
          const ws = decodeShare(payload)
          if (!ws) {
            set({ sharedLinkInvalid: true })
            clearShareHash()
            return
          }
          // a second link while the first is under review must not turn the first into "my workspace"
          const backup = get().shared?.backup ?? workspaceOf(get())
          clearTimeout(rerunTimer)
          runToken++ // a run for the previous code must not land on the new workspace
          if (get().running) getRunner(get().language).cancel()
          set({
            ...ws,
            shared: { backup },
            running: false,
            result: null,
            ranSig: null,
            watchErrors: {},
            hoverStep: null,
            selectedStep: null,
          })
        },
        shareLink: () => buildShareUrl(location.href, workspaceOf(get())),
        keepShared() {
          set({ shared: null })
          clearShareHash()
        },
        discardShared() {
          const backup = get().shared?.backup
          if (!backup) return
          clearTimeout(rerunTimer)
          set({ ...backup, shared: null, result: null, ranSig: null, watchErrors: {} })
          clearShareHash()
          if (backup.code.trim() !== '') void get().run() // it is the visitor's own code: bring their table back
        },
        dismissInvalidLink: () => set({ sharedLinkInvalid: false }),
      }
    },
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      // While a shared workspace is under review, keep persisting the user's OWN workspace.
      partialize: (s): Workspace => (s.shared ? s.shared.backup : workspaceOf(s)),
      migrate: migrateWorkspace as never,
      merge: (persisted, current) => mergeWorkspace(persisted, current),
    },
  ),
)
