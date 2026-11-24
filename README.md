# Trace Table Studio

Write a short Python program and get the **trace table** an exam would ask for: one row per change, with a column for each variable, the printed output, and function return values. Then switch on **Study mode** to hide the answers and fill the table in yourself, or export the table (or a blank worksheet) to Markdown, CSV, LaTeX, JSON, PNG or paper.

Everything runs in your browser. Your code is executed by [Pyodide](https://pyodide.org) (CPython compiled to WebAssembly) in a Web Worker, so an infinite loop can never freeze the page, and nothing you type is uploaded anywhere.

## What it does

- **Trace tables** from real execution: Compact (a row only when something changes) or Every line (including `if`/`while`/`for` tests with ✓/✗ outcomes); values shown only where they change ("exam blanks") or carried forward. Recursion shows call depth, call rows and return values.
- **Watch expressions** (`arr[i]`, `len(items)`, `i < n`) as extra columns. They are read-only by construction: a watch can't change your program (`arr.pop()` is refused with an explanation).
- **Study mode**: hide every written cell, a random share, or chosen columns. Answers are graded like an exam marker would: quote style, spacing and dict/set order don't matter; `3` for `3.0`, `true` for `True`, a list written as a tuple are "almost". Hints give the *shape* of an answer, never the answer. A wrong answer offers **Why?** (Alt+W): the working for that line without the answer; after Reveal it states the result too. Fully usable by keyboard.
- **Exam pseudocode**: read the program in AQA, OCR or SQA style, with the line behind the selected row highlighted. It parses the code without running it. Python with no exam equivalent is left as written and marked, and comments are left out.
- **Export**: Markdown, CSV, LaTeX (table or full document), JSON (the whole trace), PNG, and print / PDF, each as an **answer key** or a **worksheet** with the study cells left blank.
- **Share links** carry your code, inputs, watches, column choices and study settings in the URL hash. A shared program is shown for review and **never runs until you press Run**.
- Your workspace and in-progress study sessions are remembered in your browser (`localStorage`).

## Run it

You need [Node.js](https://nodejs.org) 20+ and, to run the tracer tests, [uv](https://docs.astral.sh/uv/).

```powershell
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
|---------|--------------|
| `npm test` | Unit and UI tests (Vitest, jsdom) |
| `npm run test:py` | Tracer tests on plain CPython (also run with `--python 3.13` and `3.14`; Pyodide ships 3.14) |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run fixtures` | Regenerate `tests/fixtures/wire/*.json` from the real tracer (the Python↔TypeScript contract) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` **with the production security headers**, to test the real CSP |

On Windows, application-control policies can block programs inside a project `.venv`; the Python scripts therefore use `uv run --no-project --with pytest …` (see `CLAUDE.md`).

## Deploy

It is a static site. Upload `dist/` to Netlify, Cloudflare Pages, or any static host that honours a `_headers` file; `public/_headers` is copied into `dist/` and sets:

- `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` (cross-origin isolation; optional, the app works without it)
- a strict **Content-Security-Policy**: scripts only from the site itself and the pinned Pyodide build on `cdn.jsdelivr.net` (`'wasm-unsafe-eval'` for WebAssembly, no `'unsafe-eval'`, no inline scripts), no framing, no form posts
- `nosniff`, `Referrer-Policy: no-referrer`, and a `Permissions-Policy` that turns off camera, microphone and location

`public/_redirects` (`/*  /index.html  200`) is the single-page-app fallback, so deep links such as `/trace-table` and reloads work on Netlify and Cloudflare Pages. Vercel ignores both files and would need a `vercel.json` with the same headers and a rewrite (see PLAN.md D2).

On hosts that can't set headers (GitHub Pages) the app still works; you just don't get the CSP.

The Python runtime (~10 MB) is downloaded from the CDN the first time and then cached by the browser. Offline first visits show a "Python couldn't be loaded" message with a retry button.

## How it is built

The design and the reasoning behind each decision are in [PLAN.md](PLAN.md) (sections 11–15 record what changed from the original plan and why). The short version:

- `src/languages/python/tracer.py` runs the program under `sys.settrace` and streams one row per executed line; a TypeScript `TraceRunner` interface keeps the UI, table, study mode and exporters independent of the language, so another language is one new adapter.
- Everything the user can change after a run (rows, columns, cell style, masking) is a pure projection of the recorded trace in `src/core`; none of it re-runs the program.
- `src/core/study` (grading) and `src/core/export` are language-neutral and heavily tested, including a property test that every value the app prints can be typed back and parsed to the same value.

## Notes on trust

- Programs run in your browser, in a worker, with step, time and recursion limits; code blocked inside a native call is stopped by killing the worker.
- Shared links, saved data and student answers are treated as untrusted input: sanitised field by field, size-limited, and (for links) capped before decompression.
- CSV exports neutralise spreadsheet formulas, and exported LaTeX escapes every special character.
