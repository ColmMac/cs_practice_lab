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

## Status
M0, M1, M2 and M3 are done (see PLAN.md §9 and §11-§13). Next: **M4** — Study Mode (masking, answer entry, grading with `parseAnswer`, scores, hints), including `src/languages/python/literal.ts` and persisting study sessions by `executionKey`.
