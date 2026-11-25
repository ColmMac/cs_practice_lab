# CS Practice Lab

Free computer science revision tools that run entirely in your browser, with no login: **https://cspracticelab.com**

It is for students on GCSE, SQA National 5 and Higher, A-Level and first-year programming courses, and for the people who teach them. Not every tool matches every course, and the site isn't affiliated with or endorsed by any exam board.

## The four tools

### Trace tables (`/trace-table`)

Write a short Python program and get the trace table an exam would ask for, from real execution: one row per change or one per line, with variables, conditions, printed output, return values and your own read-only watch expressions. Study mode hides cells for you to fill in, grades them the way a marker would, and can explain a wrong answer without giving it away. You can also read the program as AQA, OCR or SQA style pseudocode, share it by link, set a student challenge, and export an answer key or worksheet to Markdown, CSV, LaTeX, JSON, PNG or print. [Pyodide](https://pyodide.org) (CPython compiled to WebAssembly) runs the code in a Web Worker, so an infinite loop can't freeze the page. A challenge link is classroom practice, **not** a secure test: the program is in the link.

### Truth tables (`/truth-tables`)

Type a Boolean expression, or pick an example such as a half or full adder, and get its truth table, with an optional working column for each sub-expression and values shown as 0/1 or T/F. Study mode lets you fill the table in yourself, and it exports as an answer key or a worksheet.

### Number systems (`/number-systems`)

Toggle the bits of an 8-bit or 16-bit register and see the denary, signed, binary and hex values change together. It covers two's complement, shifts and binary addition with overflow, and a Practice mode asks seeded sets of questions and shows the working after you check them.

### Sorting and searching (`/sorting-visualizer`)

Step through bubble, insertion and merge sort, and linear and binary search, on your own list, with a pass-by-pass history table you can export. Quiz mode asks you to predict each pass or probe before it is shown.

## Architecture

- **Python in a worker.** `src/languages/python/tracer.py` runs the program under `sys.settrace`, with step, time and recursion limits. Code stuck inside a native call is stopped by killing the worker.
- **One full trace, pure projections.** The worker records every line once. Granularity, column visibility, exam blanks and study masking are pure TypeScript functions in `src/core/derive`, so changing the view never re-runs the program.
- **A language-neutral core.** `src/core` (derivation, grading, export, share links) doesn't know about React or Python. A `TraceRunner` interface keeps the language behind one adapter.
- **Untrusted input stays untrusted.** Shared links and saved data are sanitised field by field and size-limited (links are capped before decompression). A shared program is shown for review and **never runs until you press Run**. CSV exports neutralise spreadsheet formulas, and LaTeX exports escape special characters.
- **A static, CSP-first deploy.** There is no application server. The production Content-Security-Policy allows no `'unsafe-eval'` and no inline scripts. Each route also gets its own static HTML file at build time, with its title, canonical link, structured data and a `<noscript>` copy of its text.

## Local development

You need [Node.js](https://nodejs.org) (20.19+ or 22.12+) and, for the tracer tests, [uv](https://docs.astral.sh/uv/).

```powershell
npm install
```

```powershell
npm run dev
```

The dev server is at http://localhost:5173. It leaves out the CSP, so test header changes with a build and preview.

| Command | What it does |
|---------|--------------|
| `npm test` | Unit and UI tests (Vitest, jsdom) |
| `npm run test:py` | Tracer tests on plain CPython (also run with `--python 3.13` and `3.14`; Pyodide ships 3.14) |
| `npm run test:e2e` | Playwright tests against production builds with the real headers |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint |
| `npm run fixtures` | Regenerate `tests/fixtures/wire/*.json` from the real tracer (the Python↔TypeScript contract) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve `dist/` **with the production security headers**, to test the real CSP |

Before the E2E tests, run `npx playwright install chromium` once, and stop any `vite preview` on port 4173 (it would be reused, and might be a stale build). If the bundled Chromium can't start, set `$env:PW_CHANNEL = 'msedge'`.

On Windows, application-control policies can block programs inside a project `.venv`, so don't use `uv sync` or `uv run pytest`. The npm scripts use `uv run --no-project` instead.

## Deploy to Cloudflare Pages

Connect the repository with Pages' Git integration and use these settings:

| Setting | Value |
|---------|-------|
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variable `NODE_VERSION` | `22` (Vite needs 20.19+ or 22.12+) |

| Build variable | Purpose |
|----------------|---------|
| `VITE_SITE_URL` | Origin used for canonical links, Open Graph, `sitemap.xml` and `robots.txt`. Defaults to `https://cspracticelab.com` |
| `VITE_ADSENSE_CLIENT` | AdSense publisher ID. Leave **unset** to build without adverts |
| `VITE_ADSENSE_SLOT` | Numeric ID of the display ad unit. Leave unset with the one above |

See [.env.example](.env.example). Never commit real values to it.

**Custom domain:** add `cspracticelab.com` under the Pages project's **Custom domains** (with its DNS on Cloudflare), and add a redirect rule from `www` to the apex.

Two files in `public/` are copied into `dist/`:

- `_headers` holds all the security headers: the Content-Security-Policy, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and a `Permissions-Policy`. It caches the hashed files under `/assets/` for a year and makes HTML revalidate. There is deliberately no `Cross-Origin-Embedder-Policy`, which would block ad frames. The CSP already allows the AdSense and consent-message hosts, even with adverts off.
- `_redirects` (`/*  /index.html  200`) is the single-page-app fallback for addresses with no file of their own. In the first deploy's build log, check whether Pages ignores it as an infinite loop. If so, rely on Pages' built-in fallback (there is no top-level `404.html`). Either way, an unknown address should show the app's own "Page not found".

After a deploy, check that deep links such as `/trace-table` load without a trailing-slash redirect, that `/sitemap.xml`, `/robots.txt` and `/ads.txt` are served as files, and that Python loads with no CSP errors in the console.

The Python runtime (about 10 MB) comes from the jsDelivr CDN on the first visit and is then cached by the browser. If it can't be loaded, the trace page says so and offers a retry.

## Activating Google AdSense

AdSense is off unless the build is given a publisher ID. Adverts are requested as non-personalised, appear only in fixed slots, and are left out of study, quiz, practice, challenge and projector modes. Leave **Auto ads** off.

1. Get the site approved, then note your `ca-pub-…` ID and create one display ad unit. Note its numeric slot ID.
2. In Pages → **Settings** → **Environment variables** (Production), set `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_SLOT`. A malformed publisher ID fails the build.
3. In `public/ads.txt`, replace the commented line with `google.com, pub-…, DIRECT, f08c47fec0942fa0`, using your own ID.
4. In AdSense → **Privacy & messaging**, make sure the **European regulations** consent message (UK, EEA and Switzerland) is published, with non-personalised ads, before any visitor gets adverts.
5. Redeploy, check `/ads.txt`, and check the console for CSP violations with adverts live. Ad networks change hosts, so be ready to update the CSP in `_headers`. Also check that "Manage cookie choices" on `/privacy` reopens the consent message.
