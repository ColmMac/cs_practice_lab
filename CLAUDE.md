# Trace Table Studio

Client-side Python trace-table generator (React + TS + Vite, Pyodide in a Web Worker). Full design: [PLAN.md](PLAN.md) — read it before changing contracts.

## Commands
- `npm run dev` / `npm test` (Vitest) / `npm run typecheck` / `npm run lint` / `npm run build`
- `npm run fixtures` — regenerate `tests/fixtures/wire/*.json` from the real `tracer.py`; the Vitest suite consumes them, so review the diff (it is the Python↔TS wire contract).
- `npm run test:py` (= `uv run --no-project --python 3.12 --with pytest python -m pytest tests/tracer -p no:cacheprovider`) — tracer tests. Run on 3.12, 3.13 AND 3.14 (swap `--python`); Pyodide 314.x ships Python **3.14**. Default `python` on this machine is 3.7: never use it.
- Windows Application Control blocks executables inside a project `.venv` (os error 4551), so don't use `uv run pytest` / `uv sync`; use the ephemeral `--no-project --with pytest` form above.
- Node is installed system-wide (winget). In a fresh PowerShell it may need PATH refreshed from the Machine/User environment.

## Rules
- The worker records the FULL every-line trace. Granularity, column visibility, Exam-blanks and Study masking are pure TS projections in `src/core/derive` — never re-run code for them.
- Rows are POST-state: a `line` event is finalised on the next event in that frame.
- `src/core` is framework- and language-agnostic; Python specifics live in `src/languages/python`.
- `tracer.py` must not import `js`/`pyodide` (it is tested with plain CPython).
- `runTrace` resolves with a `status` for all user-code failures; it rejects only if the runtime is broken.
- Code from share links must never auto-run.
- Git: this folder is its own repo (`ColmMac/trace_table`), nested inside `C:\ip`. Commit from here.
- Presets are real files in `src/languages/python/presets/` (`presets.json` + `*.py`). After editing one, run `npm run fixtures` and review the golden tables in `tests/fixtures/presets/*.txt` BY HAND against your own execution of the program before accepting a snapshot; a freshly written snapshot proves nothing. (This caught a real bug in M2.)
- When writing Python test code via a shell heredoc, `\n` escapes get mangled. Use the Write/Edit tools for files that contain them.
- The editor's lint machinery must stay a static extension (`linter(null)`); `setDiagnostics` alone is discarded when @uiw/react-codemirror reconfigures.
- Zustand v5: a selector must return a STABLE value. `useStore(s => s.x ?? [])` creates a new array every call and loops React forever; use a module-level constant.
- `Workspace` (src/core/workspace.ts) is the ONE shape for persistence and share links, always passed through `sanitizeWorkspace`. Never trust stored or linked data; never spread it into state.
- Watch expressions must never change the program: keep the static allowlist AND the `__tt_method__` run-time guard in tracer.py.
- Shared-link code must never auto-run. While a shared workspace is under review the visitor's OWN workspace stays the persisted one (`shared.backup`). Anything that replaces the workspace must drop a queued re-run (`clearTimeout(rerunTimer)`) and bump `runToken`.
- Tests: `userEvent.setup()` installs its own clipboard stub, so stub `navigator.clipboard` after it; `setState` on the persisted store writes localStorage immediately; call `useStore.getState().cancelScheduledRerun()` between tests.
- If a Windows `Errno 22` hits a fixture write, just rerun (the generator already retries); it is antivirus/file locking, not a bug.
- Study Mode grading lives in `src/core/study` (language-neutral). A language supplies `parseAnswer` (and optionally `looseParse`); never put language rules in core. Grading messages must never contain the ground truth.
- Study Mode answer boxes: keep the keyboard contract (Enter/↓ next, Shift+Enter/↑ previous, Alt+H hint, Alt+R reveal, Ctrl/⌘+Enter still runs). A row's own keydown handler must ignore keys that bubble up from an input (it once swallowed Space).
- In tests, `getAllByText(/Correct/)` also matches the always-rendered `<details>` table; read feedback through each box's `aria-describedby` (`verdicts()` in studyMode.test.tsx).
- Playwright E2E: `npx playwright test` (= `npm run test:e2e`) builds the app, serves it with `vite preview` on :4173 (real CSP headers) and runs `tests/e2e`. Chromium is installed. **Stop any running `vite preview` on :4173 first** (`reuseExistingServer` would test a stale build). If bundled Chromium cannot launch, set `$env:PW_CHANNEL = 'msedge'`. The app's browser pane (can be throttled to ~2 animation frames/s, no focus) is still used for real-browser checks: wait for the `scroll` event plus a few frames, not a fixed 300 ms.
- The trace table header sticks only while NOTHING between it and the Trace pane (`[data-scroll-parent]`) is a scroll container: don't put `overflow-*` back on the table's wrapper. Controls above the table are pinned sideways with `--pane-width` (not `100cqw`, which includes the scrollbar).
- Mastery (`hub:mastery:v1`): only `store/masteryStorage.ts` touches storage, and the home page must not import the trace store. `?preset=…&study=1` must never render an unmasked table, including one left in the store from an earlier visit.
- `useTableData(result)` is the ONE source of "the table as shown" (live, or the frozen study view). The screen, exports and print all read it. The exported program/input come from `ranInput` (what produced the table), never from the editor.
- Exports (`src/core/export`) all build from one `TableModel`. Keep the CSV formula-injection guard, the Markdown code-span/pipe escaping and the LaTeX escaping. After changing an exporter, review the golden files in `tests/fixtures/export/` BY HAND.
- The brand, origin, contact address and repo URL live in `src/config/site.ts` (also imported by `vite.config.ts`, so keep React and the store out). Every page except `noindex` ones gets a canonical on `SITE_URL` (default `https://cspracticelab.com`). `index.html` repeats the name and description (a unit test checks).
- Security headers live ONLY in `public/_headers` (also read by `vite.config.ts`). Test CSP changes with `npm run build` + `npm run preview` (the dev server omits the CSP on purpose). Note: devtools-evaluated JS bypasses the `eval` restriction, so it can't prove eval is blocked.
- UI colours are the `@theme` tokens in `src/styles/index.css` (dark values under `.dark`); see `src/components/ui/README.md`. Shadows only on floating layers. Icons are named `lucide-react` imports, `aria-hidden`, beside a text label. The sorting state glyphs, ✓ ≈ ✗ verdicts, ⚠ cells and the history table’s ▶ row marker are non-colour cues: never just delete them.
- Editor colours are `PALETTES` in `editorTheme.ts` and are contrast-tested (including the row-highlight overlays). Change a colour, run `tests/unit/editorTheme.test.ts`. **Audit accessibility on the REAL page** (axe in the browser pane, light + dark), not just jsdom: the unit tests replace CodeMirror, and two real problems were only visible there.
- React Compiler lint: don't return an object that mixes ref callbacks with plain values from a hook (`react-hooks/refs`); return them separately (see `useRowWindow`).
- Tables above 300 rows are windowed (`useRowWindow`), except in study mode.
- A page that mirrors its state to the URL (`setParams(…, { replace: true })`) does it in `useLayoutEffect`. A passive effect can still be pending at the next nav click, runs after the new URL is pushed and replaces it with the old page's (`shell.spec.ts`, "the moment it appears").
- The DOCUMENT scrolls: sticky nav, page, one `SiteFooter` (hidden in print and projector mode). A tool page wraps its header and `main` in `ToolWorkspace` (at least viewport height on wide screens; anything below the workspace goes after it, and its `main` is not a scroll box). The trace page instead has a FIXED-height block (`App.tsx`) so its columns scroll inside; on phones the Trace pane is a 60dvh grid row (an auto or `fr` row would grow with the table and break the sticky header and windowing). `--nav-h` is measured by `AppShell`.
- The Condition column is a projection of `TraceStep.branch` plus the static `TraceResult.lines` (sent in the FIRST wire chunk). `branch` stays undefined when the outcome is unknown (one-line body, raised, aborted): never default it to False. A multi-line header is one step on its first line (`Static.header_span`). While the column is visible the Line cell's T/F chip must stay hidden.
- Exam pseudocode (`pseudocode.py`) only ever calls `ast.parse`. A wrong translation is worse than none: unlisted constructs stay as Python, marked unsupported. Check a keyword change against the board's published document (PLAN.md §17.6, C3 notes) and write the goldens in `tests/fixtures/pseudocode/` by hand first.
- "Why was this wrong?" (`src/core/explain`): with `withResult: false` nothing may state the cell's value, directly or by substitution (copy-only expressions and values from unanswered masked cells stay as names). Add result text only when `withResult` is true.

- Student challenges (`mode: 'quiz'` links): a table renders only when masked. `run()` applies result and study session in ONE `set()`, is a no-op during a challenge except from Start, and `App` shows `ChallengePanel` unless the challenge is active WITH a session. A new way to leave study mode, change the mask, export or print needs a challenge lock in the store or at the render, not just a hidden button. It is classroom friction, not security: never claim otherwise.
- Projector mode is the `projector:` Tailwind variant, driven by a class on `<html>` that only `useProjectorClass` (trace page) sets. The print pack (`printJob`) contains the mark scheme, so it stays behind the challenge lock; its student page must never fall back to filled-in cells.

## Status
M0-M5, the hub tickets H0-W5.4 (PLAN.md §16) and C1-C6 of §17 are done: 1164 unit and 145 E2E tests. Every planned ticket is complete. M0-M5: the plan in PLAN.md is complete (see §9 and §11-§15). Not done / not verifiable here: LaTeX compilation, Lighthouse, real print pagination, Playwright E2E in CI (see PLAN.md §15). Ideas for later are listed at the end of §15.
