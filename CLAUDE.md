# Trace Table Studio

Client-side Python trace-table generator (React + TS + Vite, Pyodide in a Web Worker). Full design: [PLAN.md](PLAN.md) — read it before changing contracts.

## Commands (once scaffolded in M0)
- `npm run dev` / `npm test` (Vitest) / `npx tsc --noEmit` / `npx playwright test`
- `npm run test:py` (= `uv run --no-project --python 3.12 --with pytest python -m pytest tests/tracer -p no:cacheprovider`) — tracer tests; also run with `--python 3.13`. Default `python` on this machine is 3.7: never use it.
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

## Prototype
`tests/tracer/proto_*.py` are throwaway prototypes that validated the settrace design (bare `except:` swallows the abort; callee mutation of caller's list). Convert into pytest cases in M1.
