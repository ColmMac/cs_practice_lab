import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { CONDITION_COL, resolveColumns, watchColumnId } from '../core/derive/columns'
import { isQualifying, matchingItemId } from '../core/mastery/mastery'
import type { RunnerStatus, TraceRunner } from '../core/runner'
import { buildChallengeUrl, buildShareUrl, decodeShare, parseShareHash, type ChallengeSpec, type ShareUrl } from '../core/share/urlState'
import { gradeAnswer, type GradingLanguage } from '../core/study/grade'
import { selectMasks } from '../core/study/mask'
import { buildStudyModel, type StudyView } from '../core/study/model'
import { summarise } from '../core/study/score'
import { rememberSession, sanitizeStudyConfig, MAX_ANSWER_LENGTH, type StudySessionData } from '../core/study/session'
import { newSeed } from '../core/study/rng'
import type { ExportVariant } from '../core/export/tableModel'
import { DEFAULT_STUDY_CONFIG, type Grade, type StudyConfig } from '../core/study/types'
import { DEFAULT_TRACE_OPTIONS, type TraceOptions, type TraceResult, type WatchExpression } from '../core/types'
import { defaultWorkspace, LIMITS, type Workspace } from '../core/workspace'
import { getLanguage } from '../languages/registry'
import { saveAttempt } from './masteryStorage'
import { mergePersisted, migrateWorkspace, safeStorage, STORAGE_KEY, STORAGE_VERSION, type PersistedState } from './persistence'
import { getRunner } from './runner'

export type PrintJob = 'table' | 'pack'

/** A study session in progress. The view (columns, row options, masks) is FROZEN when it starts. */
export interface StudyState extends StudyView {
  executionKey: string
  answers: Record<string, string>
  revealed: Record<string, true>
  hints: Record<string, true>
  /** Cells whose "Why?" explanation is open (not persisted). Cleared when the cell is edited. */
  why: Record<string, true>
  /** Set by Check answers; an entry disappears when that cell is edited. */
  graded: Record<string, Grade> | null
  /** Answers were restored from a saved session. */
  resumed: boolean
  /** This session has already been counted as a practice attempt (not persisted). */
  counted: boolean
}

/** A challenge opened from a student link (not persisted: a reload reopens it from the link). */
export interface ChallengeState {
  /** review: nothing has run · starting: running · active: masked table · unreproducible: a different table. */
  stage: 'review' | 'starting' | 'active' | 'unreproducible'
  spec: ChallengeSpec
  /** Reveal stays locked until the first Check answers. */
  checkedOnce: boolean
  /** The link's mask settings hid nothing in this table, so every cell is hidden instead. */
  hidNothing: boolean
}

export interface ChallengeLink extends ShareUrl {
  unreadable: boolean
  /** How many cells a student will be asked for, out of how many questions the table has. */
  hidden: number
  total: number
  /** What a student is asked when the settings hide nothing: every cell the "All cells" mask would. */
  fallback: number
}

/** Why a student link can't be made right now, or null if it can. A challenge needs a complete, current run. */
export function challengeLinkBlocker(
  s: Workspace & { result: TraceResult | null; ranSig: string | null; running: boolean; challenge: ChallengeState | null },
): string | null {
  if (s.challenge) return 'Not available during a challenge'
  if (!s.result || s.result.steps.length === 0) return 'Run a program that produces a table first'
  if (s.running || s.ranSig !== runSignature(s)) return 'Run the current program first'
  if (s.result.status !== 'ok') return 'The program must run to the end without errors'
  if (!getLanguage(s.result.language).parseAnswer) return 'Study mode isn’t available for this language yet'
  return null
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
  /** Export dialog choices (not persisted). `packStudyBlanks`: the printed worksheet keeps the unmasked cells. */
  exportOptions: { variant: ExportVariant; includeCode: boolean; packStudyBlanks: boolean }
  /** What the next print shows: the table as chosen, or worksheet + mark scheme. Back to 'table' afterwards. */
  printJob: PrintJob

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
  shared: { backup: Workspace; brokenChallenge?: true } | null
  sharedLinkInvalid: boolean
  challenge: ChallengeState | null
  /**
   * Start this study session in the SAME update that delivers the next result, so no unmasked table renders.
   * Set by a challenge’s Start button and by a `?preset=…&study=1` practice link.
   */
  studyOnRun: { config: StudyConfig; seed: number } | null

  init(): void
  /** Try loading Python again after it failed (offline, blocked CDN…). */
  retryRuntime(): Promise<void>
  dismissWelcome(): void
  setCode(code: string): void
  setStdinText(text: string): void
  /** `study`: practise it. The table first appears already masked, as a study session with every cell hidden. */
  loadPreset(id: string, options?: { study?: boolean }): void
  run(): Promise<void>
  cancel(): void
  answerInput(text: string): Promise<void>
  setGranularity(g: Workspace['granularity']): void
  setDisplayStyle(d: Workspace['displayStyle']): void
  setHoverStep(i: number | null): void
  setExportOptions(patch: Partial<AppState['exportOptions']>): void
  setPrintJob(job: PrintJob): void
  selectStep(i: number | null): void

  // column manager
  toggleColumn(id: string): void
  setColumnOrder(ids: string[]): void
  resetColumns(): void
  setShowEphemeral(on: boolean): void
  setShowCallables(on: boolean): void
  /** The Condition column is a view of the recorded trace: nothing is re-run. */
  setShowCondition(on: boolean): void

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
  /** Open or close the explanation of a cell graded incorrect. */
  toggleWhy(key: string): void
  /** Hand-pick a cell to hide or show (the `cells` mask mode). */
  toggleCellMask(key: string): void
  resetAnswers(): void
  /** Marks the answers. Returns the first cell (in reading order) marked not correct, or null. */
  checkAnswers(): string | null
  selectStepExclusive(i: number): void

  // sharing
  openSharedFromHash(): void
  shareLink(): { url: string; length: number; tooLong: boolean }
  keepShared(): void
  discardShared(): void
  dismissInvalidLink(): void

  // student challenges
  /** A student link for the table as it is now, or null while challengeLinkBlocker says no. */
  challengeLink(): ChallengeLink | null
  /** The one click that runs a challenge's code. */
  startChallenge(): void
  /** After a table that didn't match: leave the challenge and study whatever this device produced. */
  showChallengeTable(): void
  /** Leave the challenge and bring back the visitor's own workspace. */
  endChallenge(): void
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
    showCondition: s.showCondition,
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

/** A new study session for `result`, frozen to the workspace's current view. `saved` resumes earlier answers. */
function studyStateFor(
  result: TraceResult,
  workspace: Workspace,
  config: StudyConfig,
  seed: number,
  saved?: StudySessionData,
): StudyState {
  const { visible } = resolveColumns(result, {
    showEphemeral: workspace.showEphemeral,
    showCondition: workspace.showCondition,
    watches: workspace.watches,
    hidden: workspace.hiddenColumns,
    order: workspace.columnOrder,
  })
  return {
    executionKey: result.executionKey,
    columns: visible,
    granularity: workspace.granularity,
    display: workspace.displayStyle,
    config,
    seed,
    answers: saved?.answers ?? {},
    revealed: Object.fromEntries((saved?.revealed ?? []).map((k) => [k, true as const])),
    hints: {},
    why: {},
    graded: null,
    resumed: !!saved && (Object.keys(saved.answers).length > 0 || saved.revealed.length > 0),
    counted: false,
  }
}

/**
 * The session for a practice link: every cell hidden, whatever the last mask was, so the score can count towards
 * mastery. Answers already typed for this exact program come back rather than being overwritten.
 */
function practiceSession(s: AppState, result: TraceResult, request: { config: StudyConfig; seed: number }): StudyState {
  const saved = s.studySessions[result.executionKey]
  return studyStateFor(result, s, request.config, saved?.seed || request.seed, saved)
}

/** The state update that puts a study session on screen and remembers it by executionKey. */
function sessionPatch(s: Pick<PersistedState, 'studySessions' | 'studyOrder'>, study: StudyState) {
  const data: StudySessionData = {
    config: study.config,
    seed: study.seed,
    answers: study.answers,
    revealed: Object.keys(study.revealed),
  }
  return { study, ...rememberSession(s.studySessions, s.studyOrder, study.executionKey, data) }
}

/**
 * The session for a challenge that has just run. Earlier answers come back only if they belong to the same mask
 * (a reload mid-challenge). A link that hides nothing in this table hides everything instead.
 */
function challengeSession(
  s: Workspace & Pick<PersistedState, 'studySessions'>,
  result: TraceResult,
  request: { config: StudyConfig; seed: number },
): { study: StudyState; hidNothing: boolean } {
  const draft = studyStateFor(result, s, request.config, request.seed)
  const model = buildStudyModel(result, draft, getLanguage(result.language).formatValue)
  const hidNothing = model.cells.length > 0 && model.masked.length === 0
  const config: StudyConfig = hidNothing ? { ...request.config, maskMode: 'all', outputOnly: false } : request.config
  const saved = s.studySessions[result.executionKey]
  const sameMask = !!saved && saved.seed === request.seed && JSON.stringify(saved.config) === JSON.stringify(config)
  return { study: studyStateFor(result, s, config, request.seed, sameMask ? saved : undefined), hidNothing }
}

/** What a finished run does to the study session, the challenge and any queued request to start studying. */
function afterRun(s: AppState, result: TraceResult): Partial<AppState> {
  const request = s.studyOnRun
  const studyable = result.steps.length > 0 && !!getLanguage(result.language).parseAnswer
  if (s.challenge) {
    const { spec } = s.challenge
    const reproduced = result.status === 'ok' && result.steps.length === spec.steps && result.executionKey === spec.executionKey
    if (!request || !studyable || !reproduced) {
      return { study: null, studyOnRun: null, challenge: { ...s.challenge, stage: 'unreproducible' } }
    }
    const { study, hidNothing } = challengeSession(s, result, request)
    return { ...sessionPatch(s, study), studyOnRun: null, challenge: { ...s.challenge, stage: 'active', hidNothing } }
  }
  if (request && studyable) {
    return { ...sessionPatch(s, practiceSession(s, result, request)), studyOnRun: null }
  }
  // a session belongs to one exact program run; a different one ends it
  return { study: s.study && s.study.executionKey === result.executionKey ? s.study : null, studyOnRun: null }
}

/** A run that was stopped: a starting challenge goes back to waiting for Start. */
const abandonedRun = (s: AppState): Partial<AppState> => ({
  running: false,
  studyOnRun: null,
  challenge: s.challenge?.stage === 'starting' ? { ...s.challenge, stage: 'review' } : s.challenge,
})

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
        set({ ...extra, ...sessionPatch(get(), study) })
      }

      return {
        ...defaultWorkspace(firstPreset?.code ?? '', (firstPreset?.stdin ?? []).join('\n')),

        runnerStatus: { state: 'uninitialised' },
        running: false,
        result: null,
        ranSig: null,
        ranInput: null,
        welcomed: initialWelcomed(),
        exportOptions: { variant: 'key', includeCode: false, packStudyBlanks: false },
        printJob: 'table',
        hoverStep: null,
        selectedStep: null,
        watchErrors: {},
        shared: null,
        sharedLinkInvalid: false,
        challenge: null,
        studyOnRun: null,
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

        // editing the program drops a waiting practice request: it was for the built-in, not for this
        setCode: (code) => set((s) => ({ code, studyOnRun: s.challenge ? s.studyOnRun : null })),
        setStdinText: (stdinText) => set((s) => ({ stdinText, studyOnRun: s.challenge ? s.studyOnRun : null })),

        loadPreset(id, options) {
          const p = getLanguage(get().language).presets.find((x) => x.id === id)
          if (!p) return
          clearTimeout(rerunTimer)
          if (get().running) get().cancel() // first: cancelling also drops a waiting study request
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
            challenge: null,
            studyOnRun: null,
          })
          if (options?.study) {
            // the table on screen could be this very program, unmasked: it goes before the new one is asked for
            set((s) => ({
              result: null,
              ranSig: null,
              ranInput: null,
              hoverStep: null,
              selectedStep: null,
              studyOnRun: { config: { ...DEFAULT_STUDY_CONFIG, closeCredit: s.studyConfig.closeCredit }, seed: newSeed() },
            }))
          }
          if (watches.length) watches.forEach((w) => void get().validateWatch(w.id))
          // Built-in examples are safe to run, and a student who picks one expects to see its table.
          void get().run()
        },

        async run() {
          const { language, code, stdinText, running, watches, showCallables, challenge } = get()
          // during a challenge only Start runs the code: any other run could swap the masked table for an open one
          if (running || (challenge && challenge.stage !== 'starting')) return
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
                ...afterRun(s, result),
              }))
            }
          } catch {
            // the runtime itself is broken; runnerStatus already says so. A practice request waits for "Try again",
            // so that the retry doesn't show the table unmasked.
            if (token === runToken) set((s) => ({ ...abandonedRun(s), studyOnRun: s.challenge ? null : s.studyOnRun }))
          }
        },

        cancel() {
          runToken++
          getRunner(get().language).cancel()
          set(abandonedRun)
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
        // never a pack during a challenge: its second part is the mark scheme
        setPrintJob: (printJob) => set((s) => ({ printJob: s.challenge ? 'table' : printJob })),
        selectStep: (i) => set((s) => ({ selectedStep: s.selectedStep === i ? null : i })),

        // ── column manager ──
        toggleColumn: (id) =>
          set((s) => ({
            hiddenColumns: s.hiddenColumns.includes(id) ? s.hiddenColumns.filter((x) => x !== id) : [...s.hiddenColumns, id],
          })),
        setColumnOrder: (columnOrder) => set({ columnOrder }),
        resetColumns: () =>
          set({ hiddenColumns: defaultWorkspace().hiddenColumns, columnOrder: [], showEphemeral: false, showCondition: false }),
        setShowCondition: (showCondition) =>
          // ticking the box must show the column, even if a stored or shared workspace had also hidden it
          set((s) => ({
            showCondition,
            hiddenColumns: showCondition ? s.hiddenColumns.filter((c) => c !== CONDITION_COL) : s.hiddenColumns,
          })),
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
          if (s.challenge || s.study || !r || r.steps.length === 0 || s.running || s.ranSig !== runSignature(s)) return
          if (!getLanguage(r.language).parseAnswer) return
          const saved = s.studySessions[r.executionKey]
          const config = saved?.config ?? s.studyConfig
          const seed = saved?.seed || s.studySeed || newSeed()
          commitStudy(studyStateFor(r, s, config, seed, saved), {
            studyConfig: config,
            studySeed: seed,
            hoverStep: null,
            selectedStep: null,
          })
        },

        exitStudy() {
          if (!get().challenge) set({ study: null, hoverStep: null })
        },

        setStudyConfig(patch) {
          const st = get().study
          if (!st || get().challenge) return
          const config = sanitizeStudyConfig({ ...st.config, ...patch }, st.config)
          commitStudy({ ...st, config, graded: null, hints: {}, why: {} }, { studyConfig: config })
        },

        reshuffleStudy() {
          const st = get().study
          if (!st || get().challenge) return
          const seed = newSeed()
          commitStudy(
            { ...st, seed, answers: {}, revealed: {}, hints: {}, why: {}, graded: null, resumed: false, counted: false },
            { studySeed: seed },
          )
        },

        setAnswer(key, text) {
          const st = get().study
          if (!st) return
          commitStudy({
            ...st,
            answers: { ...st.answers, [key]: text.slice(0, MAX_ANSWER_LENGTH) },
            graded: withoutKey(st.graded, key),
            why: without(st.why, key),
          })
        },

        revealCell(key) {
          const { study: st, challenge } = get()
          if (!st || (challenge && !challenge.checkedOnce)) return
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

        toggleWhy(key) {
          const st = get().study
          if (!st || st.graded?.[key]?.state !== 'incorrect') return
          set({ study: { ...st, why: st.why[key] ? without(st.why, key) : { ...st.why, [key]: true } } })
        },

        toggleCellMask(key) {
          const { study: st, result: r, challenge } = get()
          if (!st || !r || challenge || st.config.maskMode !== 'cells') return
          // keys left over from another program are dropped, so they don't use up the limit
          const here = new Set(buildStudyModel(r, st, getLanguage(r.language).formatValue).cells.map((c) => c.key))
          if (!here.has(key)) return
          const cells = st.config.cells.filter((k) => here.has(k))
          get().setStudyConfig({ cells: cells.includes(key) ? cells.filter((k) => k !== key) : [...cells, key] })
        },

        resetAnswers() {
          const st = get().study
          if (!st) return
          commitStudy({ ...st, answers: {}, revealed: {}, hints: {}, why: {}, graded: null, resumed: false, counted: false })
        },

        checkAnswers() {
          const { study: st, result: r, ranInput } = get()
          if (!st || !r) return null
          const lang = getLanguage(r.language)
          if (!lang.parseAnswer) return null
          const grader: GradingLanguage = { formatValue: lang.formatValue, parseAnswer: lang.parseAnswer, looseParse: lang.looseParse }
          const graded: Record<string, Grade> = {}
          const model = buildStudyModel(r, st, lang.formatValue)
          for (const cell of model.masked) {
            if (!st.revealed[cell.key]) graded[cell.key] = gradeAnswer(st.answers[cell.key] ?? '', cell.truth, grader)
          }
          // practice on an unedited built-in counts towards mastery, if enough of the table was really answered
          const itemId = ranInput && r.language === 'python' ? matchingItemId(ranInput, lang.presets) : null
          const score = summarise(model.masked, graded, st.revealed, st.config.closeCredit, (id) => id)
          // starting constants are not asked by default, so they don't count against the share answered
          const askable = model.cells.filter((c) => !c.given).length || model.cells.length
          const counts = itemId !== null && isQualifying(score.total, askable)
          if (counts) saveAttempt({ tool: 'trace', itemId, percent: score.percent, newSession: !st.counted })
          const { challenge } = get()
          set({
            study: { ...st, graded, counted: st.counted || counts },
            challenge: challenge && { ...challenge, checkedOnce: true },
          })
          return model.masked.find((c) => graded[c.key]?.state === 'incorrect')?.key ?? null
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
          const decoded = decodeShare(payload)
          if (!decoded) {
            set({ sharedLinkInvalid: true })
            clearShareHash()
            return
          }
          // a second link while the first is under review must not turn the first into "my workspace"
          const backup = get().shared?.backup ?? workspaceOf(get())
          clearTimeout(rerunTimer)
          runToken++ // a run for the previous code must not land on the new workspace
          if (get().running) getRunner(get().language).cancel()
          const { workspace, mode, challenge: spec } = decoded
          set({
            ...workspace,
            shared: mode === 'quiz' && !spec ? { backup, brokenChallenge: true } : { backup },
            challenge: spec ? { stage: 'review', spec, checkedOnce: false, hidNothing: false } : null,
            studyOnRun: null,
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
          if (get().challenge) return
          set({ shared: null })
          clearShareHash()
        },
        discardShared() {
          const backup = get().shared?.backup
          if (!backup) return
          clearTimeout(rerunTimer)
          runToken++ // a run for the shared code must not land on the restored workspace
          if (get().running) getRunner(get().language).cancel()
          set({
            ...backup,
            shared: null,
            challenge: null,
            studyOnRun: null,
            running: false,
            result: null,
            ranSig: null,
            ranInput: null,
            watchErrors: {},
            hoverStep: null,
            selectedStep: null,
            study: null,
          })
          clearShareHash()
          if (backup.code.trim() !== '') void get().run() // it is the visitor's own code: bring their table back
        },
        dismissInvalidLink: () => set({ sharedLinkInvalid: false }),

        // ── student challenges ──
        challengeLink() {
          const s = get()
          const r = s.result
          if (!r || challengeLinkBlocker(s)) return null
          // the mask on screen if a session is running, otherwise the saved settings
          const config = s.study?.config ?? s.studyConfig
          // choose the seed BEFORE encoding, so every student gets the same random mask
          const seed = s.study?.seed || s.studySeed || newSeed()
          if (!s.study && seed !== s.studySeed) set({ studySeed: seed }) // copying again gives the same link
          const view = s.study ?? studyStateFor(r, s, config, seed)
          const model = buildStudyModel(r, view, getLanguage(r.language).formatValue)
          const link = buildChallengeUrl(
            location.href,
            { ...workspaceOf(s), studyConfig: config, studySeed: seed },
            { steps: r.steps.length, executionKey: r.executionKey },
          )
          const fallback = selectMasks(model.cells, { ...config, maskMode: 'all', outputOnly: false }, seed).size
          return { ...link, hidden: model.masked.length, total: model.cells.length, fallback }
        },

        startChallenge() {
          const s = get()
          if (s.challenge?.stage !== 'review' || s.running) return
          set({
            challenge: { ...s.challenge, stage: 'starting' },
            studyOnRun: { config: s.studyConfig, seed: s.studySeed || newSeed() },
          })
          void get().run()
        },

        showChallengeTable() {
          const s = get()
          if (s.challenge?.stage !== 'unreproducible') return
          const r = s.result
          if (!r || r.steps.length === 0 || !getLanguage(r.language).parseAnswer) {
            set({ challenge: null })
            return
          }
          // one update: the table must not appear unmasked on the way out of the challenge
          commitStudy(studyStateFor(r, s, s.studyConfig, s.studySeed || newSeed()), { challenge: null })
        },

        endChallenge() {
          if (get().challenge) get().discardShared()
        },
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
