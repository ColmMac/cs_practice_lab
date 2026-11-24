import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { resolveColumns, watchColumnId } from '../core/derive/columns'
import type { RunnerStatus, TraceRunner } from '../core/runner'
import { buildShareUrl, decodeShare, parseShareHash } from '../core/share/urlState'
import { gradeAnswer, type GradingLanguage } from '../core/study/grade'
import { buildStudyModel, type StudyView } from '../core/study/model'
import { rememberSession, sanitizeStudyConfig, MAX_ANSWER_LENGTH, type StudySessionData } from '../core/study/session'
import { newSeed } from '../core/study/rng'
import type { ExportVariant } from '../core/export/tableModel'
import type { Grade, StudyConfig } from '../core/study/types'
import { DEFAULT_TRACE_OPTIONS, type TraceOptions, type TraceResult, type WatchExpression } from '../core/types'
import { defaultWorkspace, LIMITS, type Workspace } from '../core/workspace'
import { getLanguage } from '../languages/registry'
import { mergePersisted, migrateWorkspace, safeStorage, STORAGE_KEY, STORAGE_VERSION, type PersistedState } from './persistence'
import { getRunner } from './runner'

/** A study session in progress. The view (columns, row options, masks) is FROZEN when it starts. */
export interface StudyState extends StudyView {
  executionKey: string
  answers: Record<string, string>
  revealed: Record<string, true>
  hints: Record<string, true>
  /** Set by Check answers; an entry disappears when that cell is edited. */
  graded: Record<string, Grade> | null
  /** Answers were restored from a saved session. */
  resumed: boolean
}

interface AppState extends PersistedState {
  runnerStatus: RunnerStatus
  running: boolean
  result: TraceResult | null
  /** What produced `result` (code, inputs, watches, options); if the current signature differs, the table is stale. */
  ranSig: string | null
  /** The exact program and input behind `result`: exports use these, never the (possibly edited) editor text. */
  ranInput: { code: string; stdin: string[] } | null
  /** The first-visit welcome has been dismissed (remembered in its own localStorage key, not in the workspace). */
  welcomed: boolean
  /** Export dialog choices (not persisted). */
  exportOptions: { variant: ExportVariant; includeCode: boolean }

  /** stepIndex of the table row under the mouse / focused, and of the clicked row. */
  hoverStep: number | null
  selectedStep: number | null

  /** Study Mode: null when off. */
  study: StudyState | null

  /** Validation message per watch id (from the Python side), shown under the watch. */
  watchErrors: Record<string, string>

  /**
   * Set while a shared workspace is loaded but not yet kept: `backup` is the user's own workspace, which
   * stays what gets persisted until they choose. `invalid` flags an unusable #s= link.
   */
  shared: { backup: Workspace } | null
  sharedLinkInvalid: boolean

  init(): void
  /** Try loading Python again after it failed (offline, blocked CDN…). */
  retryRuntime(): Promise<void>
  dismissWelcome(): void
  setCode(code: string): void
  setStdinText(text: string): void
  loadPreset(id: string): void
  run(): Promise<void>
  cancel(): void
  answerInput(text: string): Promise<void>
  setGranularity(g: Workspace['granularity']): void
  setDisplayStyle(d: Workspace['displayStyle']): void
  setHoverStep(i: number | null): void
  setExportOptions(patch: Partial<AppState['exportOptions']>): void
  selectStep(i: number | null): void

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

  // study mode
  startStudy(): void
  exitStudy(): void
  setStudyConfig(patch: Partial<StudyConfig>): void
  /** A new random mask. Clears answers (they belonged to the old mask). */
  reshuffleStudy(): void
  setAnswer(key: string, text: string): void
  revealCell(key: string): void
  toggleHint(key: string): void
  resetAnswers(): void
  checkAnswers(): void
  selectStepExclusive(i: number): void

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
    studyConfig: s.studyConfig,
    studySeed: s.studySeed,
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

const WELCOME_KEY = 'tts:welcomed'
function initialWelcomed(): boolean {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false // storage blocked: show it (it just won't be remembered)
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

/** `graded` minus one cell (an edited cell goes back to ungraded). */
function withoutKey(graded: Record<string, Grade> | null, key: string): Record<string, Grade> | null {
  if (!graded || !(key in graded)) return graded
  const copy = { ...graded }
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
          // only if the table is really out of date (e.g. loading an example already ran it)
          if (s.result && !s.running && s.ranSig !== runSignature(s)) void s.run()
        }, 500)
      }

      /** Apply a new study state and remember the session (answers, mask settings) by executionKey, in one update. */
      const commitStudy = (study: StudyState, extra: Partial<AppState> = {}) => {
        const { studySessions, studyOrder } = get()
        const data: StudySessionData = {
          config: study.config,
          seed: study.seed,
          answers: study.answers,
          revealed: Object.keys(study.revealed),
        }
        set({ ...extra, study, ...rememberSession(studySessions, studyOrder, study.executionKey, data) })
      }

      return {
        ...defaultWorkspace(firstPreset?.code ?? '', (firstPreset?.stdin ?? []).join('\n')),

        runnerStatus: { state: 'uninitialised' },
        running: false,
        result: null,
        ranSig: null,
        ranInput: null,
        welcomed: initialWelcomed(),
        exportOptions: { variant: 'key', includeCode: false },
        hoverStep: null,
        selectedStep: null,
        watchErrors: {},
        shared: null,
        sharedLinkInvalid: false,
        study: null,
        studySessions: {},
        studyOrder: [],

        init() {
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

        async retryRuntime() {
          const runner = getRunner(get().language)
          try {
            await runner.init() // a failed runtime starts a fresh worker on the next init()
          } catch {
            return // still failing: runnerStatus keeps saying so
          }
          const s = get()
          if (!s.shared && !s.result && s.code.trim() !== '') void s.run()
        },

        dismissWelcome() {
          try {
            localStorage.setItem(WELCOME_KEY, '1')
          } catch {
            /* ignore: it just won't be remembered */
          }
          set({ welcomed: true })
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
            study: null,
          })
          if (watches.length) watches.forEach((w) => void get().validateWatch(w.id))
          // Built-in examples are safe to run, and a student who picks one expects to see its table.
          if (get().running) get().cancel()
          void get().run()
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
            if (token === runToken) {
              set((s) => ({
                result,
                ranSig: sig,
                ranInput: { code, stdin: options.stdin },
                running: false,
                hoverStep: null,
                selectedStep: null,
                // a session belongs to one exact program run; a different one ends it
                study: s.study && s.study.executionKey === result.executionKey ? s.study : null,
              }))
            }
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
        setExportOptions: (patch) => set((s) => ({ exportOptions: { ...s.exportOptions, ...patch } })),
        selectStep: (i) => set((s) => ({ selectedStep: s.selectedStep === i ? null : i })),

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

        // ── study mode ──
        startStudy() {
          const s = get()
          const r = s.result
          if (s.study || !r || r.steps.length === 0 || s.running || s.ranSig !== runSignature(s)) return
          if (!getLanguage(r.language).parseAnswer) return
          const { visible } = resolveColumns(r, {
            showEphemeral: s.showEphemeral,
            watches: s.watches,
            hidden: s.hiddenColumns,
            order: s.columnOrder,
          })
          const saved = s.studySessions[r.executionKey]
          const config = saved?.config ?? s.studyConfig
          const seed = saved?.seed || s.studySeed || newSeed()
          commitStudy(
            {
              executionKey: r.executionKey,
              columns: visible,
              granularity: s.granularity,
              display: s.displayStyle,
              config,
              seed,
              answers: saved?.answers ?? {},
              revealed: Object.fromEntries((saved?.revealed ?? []).map((k) => [k, true as const])),
              hints: {},
              graded: null,
              resumed: !!saved && (Object.keys(saved.answers).length > 0 || saved.revealed.length > 0),
            },
            { studyConfig: config, studySeed: seed, hoverStep: null, selectedStep: null },
          )
        },

        exitStudy: () => set({ study: null, hoverStep: null }),

        setStudyConfig(patch) {
          const st = get().study
          if (!st) return
          const config = sanitizeStudyConfig({ ...st.config, ...patch }, st.config)
          commitStudy({ ...st, config, graded: null, hints: {} }, { studyConfig: config })
        },

        reshuffleStudy() {
          const st = get().study
          if (!st) return
          const seed = newSeed()
          commitStudy({ ...st, seed, answers: {}, revealed: {}, hints: {}, graded: null, resumed: false }, { studySeed: seed })
        },

        setAnswer(key, text) {
          const st = get().study
          if (!st) return
          commitStudy({ ...st, answers: { ...st.answers, [key]: text.slice(0, MAX_ANSWER_LENGTH) }, graded: withoutKey(st.graded, key) })
        },

        revealCell(key) {
          const st = get().study
          if (!st) return
          commitStudy({ ...st, revealed: { ...st.revealed, [key]: true }, graded: withoutKey(st.graded, key) })
        },

        toggleHint(key) {
          const st = get().study
          if (!st) return
          const hints = { ...st.hints }
          if (hints[key]) delete hints[key]
          else hints[key] = true
          set({ study: { ...st, hints } })
        },

        resetAnswers() {
          const st = get().study
          if (!st) return
          commitStudy({ ...st, answers: {}, revealed: {}, hints: {}, graded: null, resumed: false })
        },

        checkAnswers() {
          const st = get().study
          const r = get().result
          if (!st || !r) return
          const lang = getLanguage(r.language)
          if (!lang.parseAnswer) return
          const grader: GradingLanguage = { formatValue: lang.formatValue, parseAnswer: lang.parseAnswer, looseParse: lang.looseParse }
          const graded: Record<string, Grade> = {}
          for (const cell of buildStudyModel(r, st, lang.formatValue).masked) {
            if (!st.revealed[cell.key]) graded[cell.key] = gradeAnswer(st.answers[cell.key] ?? '', cell.truth, grader)
          }
          set({ study: { ...st, graded } })
        },

        selectStepExclusive: (i) => set({ selectedStep: i }),

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
            ranInput: null,
            watchErrors: {},
            hoverStep: null,
            selectedStep: null,
            study: null,
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
          set({ ...backup, shared: null, result: null, ranSig: null, ranInput: null, watchErrors: {}, study: null })
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
      partialize: (s): PersistedState => ({
        ...(s.shared ? s.shared.backup : workspaceOf(s)),
        studySessions: s.studySessions,
        studyOrder: s.studyOrder,
      }),
      migrate: migrateWorkspace as never,
      merge: (persisted, current) => mergePersisted(persisted, current),
    },
  ),
)
