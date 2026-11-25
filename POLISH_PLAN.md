# CS Practice Lab — pre-launch polish plan

Production: **https://cspracticelab.com** · Brand: **CS Practice Lab** · Repo after rename: `ColmMac/cs_practice_lab`

Written 2026-11-25 from an inspection of `src/`, `tests/`, `public/`, `index.html`, `package.json`, `vite.config.ts`, `README.md`, `CLAUDE.md` and a test build (`vite build`, no env vars). Work the tickets **in order**. Each one ends with a gate, and nothing moves on while a gate is red. Contracts in `CLAUDE.md` still apply throughout. Where this plan changes one of them, the ticket says so and updates `CLAUDE.md` in the same commit.

---

## 0. What the inspection found (read before starting)

Some of the brief's assumptions don't hold for this codebase. Each point below changes a ticket.

| # | Finding | Consequence |
|---|---------|-------------|
| F1 | **There is no JSON-LD at all** (no `WebApplication`, no `FAQPage`). | P4 *adds* the schema. It can't just update it. `FAQPage` markup must match FAQ text that is **visible on the page**. Since 2023 Google shows FAQ rich results only for government and health sites, so the schema is for correctness, not a SERP feature. |
| F2 | `public/_headers` sends `Cross-Origin-Embedder-Policy: require-corp`. | COEP `require-corp` **blocks AdSense's cross-origin ad iframes outright**. The app doesn't depend on cross-origin isolation: no `SharedArrayBuffer`, and runaway code is stopped by killing the worker (`grep crossOriginIsolated` finds nothing). So COEP goes, and COOP becomes `same-origin-allow-popups`, so ad clicks can open tabs. |
| F3 | The CSP allows scripts and connections only from `'self'` and `cdn.jsdelivr.net`, has no `frame-src`, and its `img-src` excludes `https:`. | As written, the CSP **blocks AdSense and Google's consent message completely**. It has to be widened (P5). `_headers` is static, so the widened policy applies whether or not ads are switched on. That's acceptable: it allows hosts, it doesn't load them. |
| F4 | `Referrer-Policy: no-referrer`. | Ad requests lose the page origin, which risks unfilled ads or "unauthorised site" problems. Change to `strict-origin-when-cross-origin`. |
| F5 | `robots.txt` and `sitemap.xml` **are already generated** at build time from `SITE_PATHS` (`vite.config.ts` `seoFiles`). With `VITE_SITE_URL` unset, no sitemap is emitted. | Don't add hand-written copies to `public/`: they would collide with the emitted assets and drift from the route table. Extend the generator instead, and default the origin to `SITE_URL`. |
| F6 | **Pyodide's WASM comes from jsDelivr** (`PYODIDE_INDEX_URL`), not from this site. | `_headers` can't set cache headers for it. jsDelivr already serves pinned versions as immutable. The `/assets/*` immutable rule still applies to our hashed bundles. |
| F7 | **Code splitting is already done.** Every tool is `lazy()`, CodeMirror lives only in `TraceTableRoute-*.js` (541 kB), Pyodide is never bundled, and `home.spec.ts` already asserts that `/` never loads CodeMirror or Pyodide. | P11 only adds a stable vendor chunk for CodeMirror and silences the >500 kB warning on purpose. It's not a rewrite. |
| F8 | The brief asks to move shared logic into `src/utils/`. | That contradicts the established architecture: language-neutral logic lives in `src/core/*` (study, mastery, export), storage only in `store/masteryStorage.ts`, and UI primitives in `components/ui`. **Deduplicate inside those homes.** Don't create `src/utils/`. |
| F9 | The site is a pure SPA. Titles, descriptions and canonicals exist only after JS runs, and every route serves the same `index.html` (title "CS Study Hub"). | Per-route static HTML shells at build time (P4), so crawlers, link previews and the AdSense reviewer get the right `<head>` and real text without running JS. |
| F10 | The audience includes GCSE students (ages 14–16) in the UK. | The **ICO Children's Code** applies to services "likely to be accessed by children": profiling, and so personalised ads, should be off by default. Serving ads in the UK or EEA also needs a **Google-certified CMP**. Both are decisions for the owner (P0). This plan isn't legal advice. |
| F11 | No favicon. `/favicon.ico` falls through the SPA rule and returns `index.html`. | Add real icons (P1). |
| F12 | No `lucide-react`. Icons are inline SVG paths (`HomePage.tsx`). Colours are raw Tailwind palette classes: emerald ×105, red ×60, amber ×54, sky ×42, plus indigo, fuchsia, rose and yellow. There are no semantic tokens. | P2 adds tokens via Tailwind v4 `@theme` and maps the palette onto them. |
| F13 | Some symbols aren't decoration. The sorting state glyphs (`ArrayStage.tsx`: ⇄ → ↓ ↑ ◇ ✓ ◆ ★) and the study verdict marks (✓ ≈ ✗ in `AnswerCell.tsx`) are the **non-colour cue** that WCAG 1.4.1 requires. | Keep them, or replace them with equivalent icons. Never just delete them. |
| F14 | Storage keys are `tts:v1`, `tts:theme`, `tts:welcomed`, `tts:projector`, `hub:mastery:v1`, `hub:truth:last`. | **Never rename them during the rebrand**: that would wipe every visitor's work and mastery. |
| F15 | The brand string appears in exports (`core/export/json.ts`, `latex.ts`) and in E2E title assertions. | Rebranding changes golden export files. Per `CLAUDE.md`, review them by hand. |
| F16 | The trace page is a fixed-viewport grid (`lg:overflow-hidden`) inside an `h-dvh` shell. | A footer and explanatory text "below the workspace" have nowhere to go on desktop today. P3 changes the page scroll model first, without breaking the sticky table header rule. |
| F17 | The brief mentions "privacy-first analytics". **The codebase has no analytics.** | The privacy policy must describe only what actually runs: `localStorage`, jsDelivr (sees the visitor's IP when Pyodide downloads), the host's logs, AdSense and the CMP. Add analytics later only with its own policy update. |
| F18 | Tool pages have **no explanatory content** under the workspace. `Welcome` on the trace page is the only prose. | This is the biggest "low-value content" risk for AdSense review. P9 is real writing work, not boilerplate. |

---

## P0. Decisions to record before any code (owner)

- [x] **Consent and children (F10).** Recommended: configure Google's own certified CMP (AdSense → *Privacy & messaging* → European regulations message) and serve **non-personalised ads only**, given the GCSE audience. Record the choice in `PLAN.md` §18 (new) with the date. *Decided 2026-11-25: as recommended.*
- [x] **Hosting:** Cloudflare Pages with the Git integration. Confirm the `cspracticelab.com` DNS is on Cloudflare and that `www` redirects to the apex. *Decision recorded. The domain did not resolve on 2026-11-25, so the DNS and redirect check moved to P13.*
- [x] **Contact mailbox:** set up `contact@cspracticelab.com` (Cloudflare Email Routing → a real inbox) **before** `/about` goes live. AdSense reviewers check that contact details work. *Decision recorded. The mailbox is not set up yet: setup moved to P13.*
- [x] **Icon library:** add `lucide-react` (pinned exact version, tree-shaken named imports) as the brief asks. It replaces the inline SVG paths and the emoji buttons. *Approved. Installed in P2.*
- [x] **Ads on Study, practice, quiz, challenge, projector and print:** never. Confirmed by the brief. P7 specifies how.

Gate: decisions are written down in `PLAN.md` §18.

---

## P1. Site config, brand constants and head basics

- [x] Create `src/config/site.ts`:
  ```ts
  export const SITE_URL = (import.meta.env.VITE_SITE_URL || 'https://cspracticelab.com').trim().replace(/\/+$/, '')
  export const SITE_NAME = 'CS Practice Lab'
  export const SITE_DESCRIPTION = '…'      // the home description, moved from tools.ts
  export const CONTACT_EMAIL = 'contact@cspracticelab.com'
  export const REPO_URL = 'https://github.com/ColmMac/cs_practice_lab'
  ```
  Keep it free of React and the store, because `vite.config.ts` imports it in Node. Read the env through a helper that works in both Node (`loadEnv`) and the browser (`import.meta.env`). Use one exported `normaliseOrigin()` for both, replacing `siteUrl()` in `PageMeta.tsx`.
- [x] `tools.ts`: drop `BRAND` and `HOME_DESCRIPTION` in favour of `SITE_NAME` and `SITE_DESCRIPTION`. Update every importer: `AppShell`, `HomePage`, `PageMeta` and `Toolbar.tsx`, which also names the brand.
- [x] **Behaviour change:** a canonical is now **always** emitted (default origin). Update `tests/unit/seo.test.tsx` and the E2E test "there is no canonical link without VITE_SITE_URL" so they assert the default origin instead.
- [x] Add `src/vite-env.d.ts` typing `VITE_SITE_URL`, `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_SLOT` as `string | undefined` (if typing isn't already provided another way).
- [x] `index.html`: `<html lang="en-GB">`, title "CS Practice Lab", `theme-color` metas for light and dark, favicon links.
- [x] Add `public/favicon.svg`, `public/favicon.ico` (32 px), `public/apple-touch-icon.png` (180 px) and `public/og-image.png` (1200×630, plain brand mark on a neutral background, no stock art).
- [x] Grep gate: `grep -rn "localhost\|pages.dev\|netlify" src index.html public` returns only comments or test-only code. `dist/` contains no `localhost`. *2026-11-25: source is clean. `dist/` has `http://localhost` only inside react-router (its placeholder base for parsing relative URLs), none from our code.*

Gate: `npm run typecheck`, `npm test`, `npm run lint` green.

---

## P2. Design tokens and the anti-slop pass

This comes before the new UI (footer, pages, AdSlot) so those are built on the tokens from the start.

**Tokens**
- [ ] In `src/styles/index.css`, add `@theme` tokens: `--color-bg`, `--color-surface`, `--color-surface-elevated`, `--color-border`, `--color-text`, `--color-text-muted` and **one** `--color-accent` (emerald 700/300, which the focus rings and links already use), with dark-mode values under `.dark`. Keep the **status** colours (`ok`/red, `warn`/amber, `info`/sky) as named semantic tokens. They carry meaning.
- [ ] Map the shell, `Panel`, `Popover`, `Button`, `Badge`, `ToolHeader` and the nav onto the tokens. Don't touch `editorTheme.ts` `PALETTES` without re-running `tests/unit/editorTheme.test.ts` (contrast-tested).
- [ ] Sorting colours (`ArrayStage.tsx`: sky, fuchsia, indigo, emerald): keep them as distinct *state* tokens (`--color-state-swap` and so on), because they encode state. Don't collapse them to the accent.
- [ ] Shadows: remove `shadow` / `shadow-lg` except on floating layers (`Popover`, `ColumnManager` menu), and unify those to one `shadow-sm` + border. No gradients exist; keep it that way.
- [ ] Radii: 71 bare `rounded` are already uniform. Check there are no stray `rounded-lg/xl/full` on new components.

**Emoji → icons** (lucide, `aria-hidden`, visible text label kept)
- [ ] `Toolbar` ▶ Run → `Play` · `ShareButton` ⇪ → `Share2` · `ExportPanel` ⇩ → `Download` · `ChallengeLinkButton` 🎓 → `GraduationCap` · `StudyToggle` and `TruthTablePage` 📝 → `PencilLine` · `ProjectorToggle` 📽 → `Presentation` · `ThemeToggle` ☀/☾ → `Sun`/`Moon` · `AnswerCell` and `ScoreBar` 👁 → `Eye` · `WatchPanel` ✕ → `X` · `ColumnManager` ▾ ↑ ↓ and `PseudocodePanel` ▾ ▸ → `ChevronDown`/`ChevronRight`/`ArrowUp`/`ArrowDown` · `SortingPage` ◀ ▶ → `ChevronLeft`/`ChevronRight` · `Welcome` "📝 Study mode" → plain text.
- [ ] **Keep** (F13): the `ArrayStage` state glyphs, the `AnswerCell` and `ScoreBar` ✓ ≈ ✗ verdict marks, `⚠` in error cells (`rows.ts`, and the LaTeX map depends on it), and `↓ ↑` inside `<kbd>` hints.
- [ ] Home cards: replace the inline SVG `Icon` paths with lucide (`Table`, `ToggleLeft`/`Binary`, `Hash`, `BarChart3`) at one size and one stroke.
- [ ] Fix every unit and E2E test that queries a button by its emoji-prefixed name (`getByRole('button', { name: /📝 Study mode/ })` and similar). Grep the tests for each removed glyph.

**Tabular numerals.** Monospace cells already align, so the real gaps are proportional-font numbers.
- [ ] Add `tabular-nums` to the `TraceTable` cells and row and line-number column, the `TruthTableView` bit cells, `BitRegister`, `AdditionView`, the `HistoryTable` and `ArrayStage` indices, the `ScoreBar` counts, the `MasteryStrip` "x/y mastered", the mastery badge and the sorting step counter. Put it once on `tableStyles.ts`'s shared cell class where possible.

**Copy and the home page**
- [ ] Home: hero h2 becomes one plain line ("Practice tools for school and university computer science"), and the sub-line stays. The **tool cards move above** the quick starts and mastery strip, so all four are visible above the fold at 1280×800 (assert this in P12). Each card is a name, a 1–2 line summary, curriculum badges and an open link. Drop the three-bullet lists or cut them to one line.
- [ ] Tighten `Welcome`, `EmptyState` and the stale-table notice to one sentence each. Remove filler ("that just work").

Gate: unit, lint and typecheck green. **axe on the real page** (browser pane, light and dark) for `/`, `/trace-table` (including Study mode), `/truth-tables`, `/number-systems` and `/sorting-visualizer`: zero violations.

---

## P3. Page scroll model and the global footer

- [ ] `AppShell`: change from a fixed `h-dvh` viewport to a **scrolling document**: sticky nav, `<Outlet/>`, then `<SiteFooter/>`. Each tool keeps its workspace at full viewport height (`min-h-[calc(100dvh-var(--nav-h))]` on desktop), and the guide, ad and footer follow below it.
- [ ] Trace page: the workspace grid keeps `lg:overflow-hidden` with internal column scrolling **inside a fixed-height block**. The Trace pane stays the `[data-scroll-parent]` scroll container, and nothing between the table and that pane gets `overflow-*` (`CLAUDE.md` sticky-header rule). Re-run the sticky-header and windowing E2E tests and the `--pane-width` checks.
- [ ] `SiteFooter` (tokens, small text, `print:hidden`, hidden in projector mode): CS Practice Lab · About · Privacy · Contact (mailto) · GitHub · © year. One `<footer>` landmark.
- [ ] Phones: confirm there's still no horizontal scroll (the existing `hub.spec.ts` "nothing scrolls sideways" test).

Gate: the full E2E suite still passes (stop any `vite preview` on :4173 first).

---

## P4. Trust pages, per-route SEO and structured data

**Pages**
- [ ] `/about` (`src/app/AboutPage.tsx`): mission (free, no-login practice for exam-style CS skills), who it's for (UK GCSE, SQA National 5/Higher, A-Level, university CS1), what each tool does in one line, how it works (runs in the browser, nothing uploaded), contact `contact@cspracticelab.com`, and the source on GitHub. Plain, factual, no marketing adjectives.
- [ ] `/privacy` (`src/app/PrivacyPage.tsx`), describing **only what runs** (F17):
  - no accounts. `localStorage` keys and what they hold, how to clear them (the mastery "Reset" button and browser settings)
  - jsDelivr serves the Python runtime and receives the visitor's IP. Cloudflare hosts the site and keeps standard request logs
  - Google AdSense: cookies and identifiers, Google as an independent controller, a link to Google's "How Google uses information from sites that use our services", and opting out via **Google Ads Settings** and `youradchoices`/`youronlinechoices`
  - UK GDPR / EEA: lawful bases, consent through the CMP, and a **"Manage cookie choices"** button (it calls the CMP's revocation entry point, `googlefc.showRevocationMessage()`, when it's loaded, and is otherwise hidden), the child-audience stance from P0, rights, and the ICO complaint route
  - contact, and a "last updated" date
- [ ] Add both pages to `routes.tsx` (lazy, using the shared Suspense fallback from P11) and to `SITE_PATHS`. Make the non-tool routes separate from `TOOLS` (for example `INFO_PAGES`) so the nav stays four tools.

**Head tags per route**
- [ ] `PageMeta` renders: unique `<title>` (`"<Page> · CS Practice Lab"`, home just "CS Practice Lab"), description, `link rel=canonical` = `SITE_URL + path` (no query, no trailing slash except `/`), `og:type`, `og:url` (= canonical), `og:title`, `og:description`, `og:site_name`, `og:image` (absolute), `twitter:card=summary_large_image`. The 404 page stays `noindex` with no canonical.
- [ ] JSON-LD (React 19 hoists `<script type="application/ld+json">`. Check it lands in `<head>`. If it doesn't, render it in-body, which Google accepts):
  - every page: a `WebSite` with `@id: SITE_URL + '/#website'`, `name: SITE_NAME`, `url: SITE_URL + '/'`
  - each tool page: a `WebApplication` (`@id: canonical + '#app'`, `name`, `url`, `applicationCategory: EducationalApplication`, `operatingSystem: Any`, `isAccessibleForFree: true`, `offers` price 0 GBP, `isPartOf` → the website `@id`)
  - each tool page with an FAQ block (P9): `FAQPage` whose questions and answers are **generated from the same data** the visible FAQ renders, so they can't drift
- [ ] **The CSP and JSON-LD:** `type="application/ld+json"` is a data block, not script execution, so `script-src` doesn't block it. Verify there are no CSP console errors under `npm run preview`.

**Static per-route HTML (F9)**
- [ ] Extend the `seoFiles` plugin. After the bundle is written, clone the built `index.html` into `dist/<route>.html` for every `SITE_PATHS` entry except `/` (and patch `index.html` itself for `/`), with that route's title, description, canonical, OG tags, JSON-LD and a `<noscript>` summary of the page's guide text. Build the strings from `tools.ts` and `site.ts` so the static and runtime heads are identical. Keep `data-default` handling: `main.tsx` must remove **every** static tag that React re-renders (description, canonical, OG and JSON-LD all get `data-default`), so there are never duplicates.
- [ ] Cloudflare Pages serves `/trace-table` from `trace-table.html` (pretty URLs) and redirects `/trace-table.html` → `/trace-table`. **Verify on a preview deployment** that there is no trailing-slash redirect, so the URL matches the canonical. `vite preview` may not map extensionless paths to `.html`. If it doesn't, add a tiny preview-only middleware in `vite.config.ts` so E2E sees what production serves.
- [ ] Unit-test the shell generator: each route gets exactly one canonical, its own title, and valid JSON (`JSON.parse` of each ld+json block).

**sitemap and robots (F5)**
- [ ] The generator uses `SITE_URL` (default origin), so the sitemap is **always** emitted. It includes `/about` and `/privacy`, plus `<lastmod>` (build date). Remove the "not generated" warning branch and its test expectation.
- [ ] `robots.txt`: `User-agent: *`, `Allow: /`, `Sitemap: https://cspracticelab.com/sitemap.xml`.

Gate: unit and E2E green. `curl` the built files (`dist/sitemap.xml`, `dist/robots.txt`, `dist/trace-table.html`) and read them.

---

## P5. Hosting config: `_headers`, `_redirects`, `ads.txt`

- [ ] `public/_headers` `/*` block:
  - remove `Cross-Origin-Embedder-Policy` (F2). `Cross-Origin-Opener-Policy: same-origin-allow-popups`
  - `Referrer-Policy: strict-origin-when-cross-origin` (F4)
  - CSP widened for AdSense and Google's CMP, still with no `'unsafe-eval'` and no inline scripts of our own. Start from Google's published AdSense CSP host list: `script-src` adds `https://pagead2.googlesyndication.com https://*.googlesyndication.com https://*.doubleclick.net https://*.google https://*.adtrafficquality.google https://fundingchoicesmessages.google.com https://www.googletagservices.com`, `frame-src` lists those ad and CMP frame hosts plus `https://www.google.com`, `img-src` adds `https:`, and `connect-src` adds the googlesyndication, adtrafficquality and `*.google` hosts. Keep `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'` and `form-action 'none'`.
  - **Expect iteration.** Ad networks change hosts. Before launch, run with ads live on a preview deployment and fix every CSP violation in the console. Optionally add a `Content-Security-Policy-Report-Only` stricter variant for a week to see what would break.
- [ ] Add cache blocks (order matters: Cloudflare merges matching blocks):
  ```
  /assets/*
    Cache-Control: public, max-age=31536000, immutable
  /index.html
    Cache-Control: no-cache
  /*.html
    Cache-Control: no-cache
  ```
  Pyodide is on jsDelivr (F6). Note that in a comment instead of pretending to set it.
- [ ] `vite.config.ts` `readSiteHeaders()` reads only the `/*` block. Keep that, and also update the stale comment (no more COEP).
- [ ] `public/_redirects`: keep `/*  /index.html  200` (the brief, `deploy.test.ts`). **Check the Cloudflare Pages build log** on the first deploy. If Pages reports the rule as ignored ("infinite loop detected"), rely on Pages' built-in SPA fallback (no top-level `404.html`) and record that in `PLAN.md`. Either way, an unknown path must still render the app's own 404 (`noindex`).
- [ ] `public/ads.txt`:
  ```
  # Replace with your publisher ID after AdSense approval, then remove the leading '# '.
  # google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0
  ```
- [ ] Static files beat the SPA rule only if they exist. E2E (P12) must assert `content-type: text/plain` for `robots.txt` and `ads.txt` and `application/xml` for `sitemap.xml`, not just HTTP 200 (a missing file would return `index.html` with 200).
- [ ] Update `tests/unit/deploy.test.ts`: no COEP, the CSP contains the AdSense hosts and still no `'unsafe-eval'`, the `/assets/*` immutable rule is present, and `ads.txt` exists.
- [ ] `CLAUDE.md`: update the Security-headers rule (COEP removed on purpose, AdSense hosts allowed).

Gate: `npm run build` + `npm run preview`, then load every route in the browser pane: no CSP errors, Pyodide still loads, and the trace page still runs and stops `while True: pass`.

---

## P6. AdSense build-time head injection and env docs

- [ ] `.env.example` (committed, and `.gitignore` already excludes `*.local`):
  ```
  # Production origin; canonical, OG, sitemap and robots use it. Default: https://cspracticelab.com
  VITE_SITE_URL=https://cspracticelab.com
  # AdSense publisher ID (ca-pub-…) and one display ad unit's numeric slot ID. Leave empty to build without ads.
  VITE_ADSENSE_CLIENT=
  VITE_ADSENSE_SLOT=
  ```
- [ ] `vite.config.ts`: an `adsense(client)` plugin with `transformIndexHtml` that, **only when** `VITE_ADSENSE_CLIENT` matches `/^ca-pub-\d{16}$/`, injects into `<head>`:
  - `<meta name="google-adsense-account" content="ca-pub-…">` (the meta-tag verification route)
  - `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-…" crossorigin="anonymous"></script>`

  If the value is empty, inject nothing. If it's malformed, fail the build with a clear message rather than ship a broken tag. The P4 route shells are cloned from the transformed HTML, so they inherit the tag. Check this.
- [ ] Unit-test the plugin on three inputs: unset → no tag, valid → both tags, malformed → throws.

Gate: build once with a fake valid ID into a temp dir and inspect `index.html` and one route shell. Build without it, and check no `googlesyndication` string appears anywhere in `dist/`.

---

## P7. `AdSlot` component and placement rules

- [ ] `src/components/ui/AdSlot.tsx` exports `AdSlot` (the placement wrapper) and `GoogleAdUnit` (the `<ins>`):
  - **Reserved box:** fixed outer height (label + 100 px), `border border-[--color-border]`, `rounded`, and a tiny "Advertisement" label above. The box size never changes between loading, filled, unfilled and fallback, so CLS is zero.
  - **Enabled** when the client and slot env vars are both valid. It renders `<ins class="adsbygoogle" style="display:block;width:100%;height:100px" data-ad-client data-ad-slot data-full-width-responsive="false">`. Use a fixed CSS height, not `data-ad-format="auto"`, so the ad can't grow the box. Don't clip it with `overflow:hidden` (cropping ads is against policy). Add `data-adtest="on"` when `import.meta.env.DEV`.
  - **Push exactly once per `<ins>`:** in an effect, skip if the element already has `data-adsbygoogle-status`. This survives StrictMode's double effect, which otherwise throws "All 'ins' elements already have ads". Wrap the push in `try/catch`.
  - **Route change:** key the unit by `pathname`, so each navigation mounts a fresh `<ins>` and push. Never refresh on a timer (policy).
  - **Fallback house card** in the same box when ads are disabled, when the script fails to load (blocked: `window.adsbygoogle` lacks the loaded flag after a timeout, or the `<script>` errored), or when AdSense marks the unit `data-ad-status="unfilled"` (watched with a `MutationObserver`). The card is one line linking to a sibling tool or the "student challenge link" tip, rotating deterministically by route rather than randomly, so tests are stable.
  - **One placement per page, chosen by breakpoint:** a `useMediaQuery('(min-width: 1024px)')` hook decides whether the desktop or mobile placement renders. **Only one is ever mounted.** Don't render both and hide one with CSS, because a `display:none` unit has zero width and AdSense errors on it.
- [ ] **Never shown** (hook `useAdsAllowed()`): Study mode on any tool (trace study, truth study, number practice, sorting quiz), any challenge stage, projector mode, print (`print:hidden`), `/privacy` and the 404. Once a mode has suppressed the slot, keep the **house card** until the next route change, so toggling Study mode doesn't fire new ad requests.
- [ ] **Placement map** (desktop / phone). Never between editor and table, never sticky, never overlapping controls:
  - `/`: below the tool cards / same
  - `/trace-table`: bottom of the Code column after `WatchPanel` / after the Trace pane. On phones the Code column sits **above** the table, so the desktop spot would be "between editor and table" there. That's why the placement switches.
  - `/truth-tables`, `/number-systems`, `/sorting-visualizer`: bottom of the secondary (right-hand) column / after the last workspace section, before the guide (P9)
  - `/about`: after the content
- [ ] Unit tests: env unset → house card; env set → `<ins>` with the right attributes and one push even under StrictMode; `unfilled` → house card; study and challenge active → nothing ad-like rendered.

Gate: unit green. In the browser pane at 1280×800 and 375×812, the box is visible, nothing overlaps, and the layout doesn't move when the fallback swaps in.

---

## P8. Consent (CMP) wiring

- [ ] In AdSense → *Privacy & messaging*, create the **European regulations** message (UK, EEA, CH) and, if wanted, the US states message. This is a dashboard step (owner). The message is served by the AdSense tag itself, so no extra script tag is needed, but its hosts must be in the CSP (P5).
- [ ] If P0 chose non-personalised ads only, set it in AdSense (*Blocking controls* / *Privacy & messaging* settings) **and** document it on `/privacy`.
- [ ] Privacy page "Manage cookie choices" button (P4) works once the CMP is live. It's hidden when `window.googlefc` is absent (ads disabled or blocked).

Gate: on a preview deployment with real IDs, a UK visitor (use a fresh profile) sees the consent message before ads, and "Manage cookie choices" reopens it.

---

## P9. Educational content on every tool page (F18)

Hand-written, accurate and exam-relevant. 300–600 words per tool, below the workspace (after P3's layout), in semantic HTML (`<section aria-labelledby>`, `<h2>`, `<h3>`, lists, one worked example). It's also emitted in the route shell's `<noscript>`.

- [ ] Put the content in `src/app/guides/*.ts(x)` as **data** (`{ intro, steps, workedExample, examTips, faq[] }`), so the visible text, the `<noscript>` copy and the `FAQPage` JSON-LD come from one source.
- [ ] **Trace tables:** what a trace table is, how examiners expect one laid out (a row per change, blank when unchanged), loops and conditions, a worked example on a preset, common mark-losing mistakes. FAQ: "Do I write a row when a value doesn't change?" and others.
- [ ] **Truth tables:** operators and precedence (NOT > AND > OR), row ordering 000→111, intermediate columns, half and full adders, the gate symbols AQA/OCR/SQA use.
- [ ] **Number systems:** binary↔denary↔hex method, two's complement (invert and add 1), overflow, shifts as ×2/÷2. A worked 8-bit example.
- [ ] **Sorting & searching:** what one "pass" means in exam answers, bubble vs insertion vs merge (what changes each pass), binary search's precondition and midpoint rule (match the app's rounding), complexity in one line each.
- [ ] Check every worked example by **running it in the tool** and by hand. A wrong worked example on an exam-practice site is worse than none. Check board-specific wording against the boards' published specifications (the same care as `CLAUDE.md`'s pseudocode rule).
- [ ] Unit test: every tool route renders a guide with at least one `h2`, more than 250 words, and an FAQ whose JSON-LD matches the visible questions exactly.

Gate: content reviewed by the owner. axe passes on the real page in light and dark.

---

## P10. Deduplication, strict types and dead files (F8)

- [ ] **Keyboard legend:** the identical `<kbd>Enter</kbd> / <kbd>↓</kbd> next · …` blocks in `StudyToolbar.tsx`, `TruthStudyPanel.tsx` and `PracticeView.tsx` → one `components/ui/KeyboardLegend.tsx` with per-tool extras (Alt+W only on trace).
- [ ] **Study toggle:** `TruthTablePage.tsx` re-implements the "Study mode: on" button that `components/study/StudyToggle.tsx` provides. Make one presentational `StudyModeButton` in `components/ui`, used by both.
- [ ] **Link styles:** `linkClass` is copied in `HomePage.tsx` and `pages.tsx` (and nav variants in `AppShell`). Export `LINK_CLASSES` from `components/ui` (token-based after P2).
- [ ] **Route fallback:** the `<Suspense fallback={<p role="status">Loading…</p>}>` block is repeated four times (six after P4) in `routes.tsx`. Use one `lazyRoute()` helper.
- [ ] **Grading and masking:** confirm truth-table study (`core/logic/study.ts`), number practice (`core/numbers/practice.ts`) and sorting quiz (`core/algorithms/quiz.ts`) reuse `core/study` (`compare`, `score`, `mask`, `rng`) rather than re-implementing scoring. Fold any duplicate into `core/study`, keeping language rules out of core (`CLAUDE.md`).
- [ ] **Mastery storage:** confirm every read and write goes through `store/masteryStorage.ts` (grep `localStorage` outside `store/`, `theme.ts` and `projector.ts`).
- [ ] **Exports:** confirm `TruthExport`, `HistoryExport` and `ExportMenu` all render through `components/ui/ExportPanel`. Merge any leftover per-tool menu markup.
- [ ] Remove the `.gitkeep` files in directories that now have files (`src/components/export`, `src/components/study`, `src/core/export`, `src/core/share`, `src/core/study`, `tests/e2e`, `tests/fixtures/presets`). There are no Vite starter files left (`src/assets`, `App.css` and `vite.svg` are already gone, which is verified).
- [ ] `npx tsc --noEmit` (= `npm run typecheck`) passes with zero errors. ESLint is clean, including the React Compiler rules.

Gate: `npm test`, `npm run test:py` on **3.12, 3.13 and 3.14**, typecheck, lint.

---

## P11. Bundle check (F7)

- [ ] In `vite.config.ts`, `build.rolldownOptions.output.codeSplitting` (the option Vite 8's own warning names) gets one group, `codemirror` (`@codemirror/*`, `@lezer/*`, `@uiw/*`), so editor code is cached separately from the trace route's app code. Set `build.chunkSizeWarningLimit` just above the measured CodeMirror chunk, with a comment, so a *new* oversized chunk still warns.
- [ ] Keep `lucide-react` tree-shaken: named imports only. Check that the entry chunk grows by no more than a few kB.
- [ ] Record entry, route and vendor chunk sizes (gzip) in `PLAN.md` §18. Baseline from today's build: entry 92 kB gz, trace route 174 kB gz, other tools 9–10 kB gz each.

Gate: `home.spec.ts` "never loads CodeMirror or Pyodide" still passes. Extend it to `/about` and `/privacy`.

---

## P12. Expanded Playwright suite

Stop any `vite preview` on :4173 first. Use `PW_CHANNEL=msedge` if bundled Chromium won't start.

- [ ] `tests/e2e/routes.spec.ts`: for each of `/`, `/trace-table`, `/truth-tables`, `/number-systems`, `/sorting-visualizer`, `/about` and `/privacy`: HTTP 200, **zero console errors and zero CSP violations** (listen for `console` errors and `securitypolicyviolation` via `addInitScript`), exactly one `h1` and one `<footer>` with About and Privacy links.
- [ ] Mastery persistence: complete a preset in Study mode → `/` shows the badge → navigate to other tools and back, and reload → the badge is still there. Extend `mastery.spec.ts` if it doesn't already cover the reload.
- [ ] `tests/e2e/seo.spec.ts` (rewrite for the new brand): per route, `link[rel=canonical]` and `og:url` equal `https://cspracticelab.com<route>`, a unique title, one description, JSON-LD parses and its `url`/`@id` start with `https://cspracticelab.com`, `FAQPage` questions equal the visible FAQ. The **raw HTML** from `request.get(route)` already contains the right canonical (static shells). `sitemap.xml` lists all seven URLs with that origin, `robots.txt` has the `Sitemap:` line, and `ads.txt` is `text/plain` with the template line. Check content types (P5).
- [ ] `tests/e2e/adslot.spec.ts`:
  - env unset (the default E2E build): the house card renders, the box height matches the reserved height, and there are no `googlesyndication` requests
  - **CLS:** a `PerformanceObserver('layout-shift')` sum < 0.01 from load to 3 s, on `/` and each tool
  - **no overlap** at 1280×800 and 375×812: the ad box's bounding rect doesn't intersect any visible button, input, editor or table rect, and on phones it sits after the Trace pane on `/trace-table`
  - absent in Study mode, an active challenge and projector mode
  - with ads "enabled": a second Playwright project builds with a fake `VITE_ADSENSE_CLIENT=ca-pub-0000000000000000` and `VITE_ADSENSE_SLOT=0000000000`, `page.route('**/pagead2.googlesyndication.com/**')` serves a stub that defines `adsbygoogle.push` and sets `data-ad-status`. Assert one push per mount, `filled` keeps the `<ins>`, `unfilled` swaps to the house card with no shift, and an aborted request (ad-blocker simulation) also swaps to the house card. No real Google traffic in tests.
- [ ] Resilience: `while True: pass` on `/trace-table` → the time-limit status appears, the page stays responsive (the nav link works while it runs), and the next normal run succeeds. Malformed hashes: `#s=` + random garbage, a truncated real payload, an oversized payload, and invalid base64 → an alert or banner, no crash, no auto-run, and the visitor's own workspace is untouched (some of this exists in `challenge.spec.ts`, so extend it rather than duplicate).

Gate: `npm run test:e2e` green on both projects.

---

## P13. Release gate (everything, in one go)

- [ ] **Domain (owner, from P0):** register `cspracticelab.com` if needed, put its DNS on Cloudflare, attach it to the Pages project and redirect `www` to the apex. Check both with a DNS lookup and `curl -I`.
- [ ] **Mailbox (owner, from P0):** route `contact@cspracticelab.com` to a real inbox with Cloudflare Email Routing, and confirm a test message arrives **before** `/about` is public.
- [ ] `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:py` (3.12, 3.13, 3.14) · `npm run test:e2e`, all green. Record the counts in `CLAUDE.md` Status.
- [ ] Golden files reviewed **by hand**: `tests/fixtures/export/*` (brand change F15), `tests/fixtures/presets/*` if any preset changed.
- [ ] axe on the real page (browser pane), light and dark, for all seven routes plus Study mode on each tool.
- [ ] Cloudflare Pages preview deployment with `VITE_SITE_URL` set and the ad env vars **unset**: open each route, then view the source to check the canonical, JSON-LD and noscript text. Check `/sitemap.xml`, `/robots.txt` and `/ads.txt`, the `_redirects` log line (P5), the response headers (`curl -I`), and that Pyodide loads with no CSP errors.
- [ ] Optional: Google's Rich Results Test and the Schema.org validator on two routes. Lighthouse (SEO and best practices) on `/` and `/trace-table`.
- [ ] Production deploy, then add the domain in Search Console and submit the sitemap.
- [ ] Apply to AdSense, which needs the site live with P4 and P9 content. On approval: set `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_SLOT` in Pages → Settings → Environment variables (Production), put the real line in `public/ads.txt`, redeploy, and recheck the CSP with live ads (P5).

---

## P14. Rebrand, repository rename and README (last, after P13 is green)

- [ ] `package.json` `"name": "cs_practice_lab"`, then run `npm install` to update the lockfile's name. Remaining brand strings (`Trace Table Studio`, `CS Study Hub`) → **CS Practice Lab** in `README.md`, `CLAUDE.md` (title, and the Git line → `ColmMac/cs_practice_lab`), the `PLAN.md` header note, `Toolbar.tsx`, the export headers (`json.ts`, `latex.ts`, re-review the goldens) and the E2E title assertions. **Don't** touch the `tts:`/`hub:` storage keys (F14).
- [ ] Rename the GitHub repo (outward-facing, so confirm with the owner at execution time):
  ```powershell
  gh repo rename cs_practice_lab --yes
  ```
  ```powershell
  git remote set-url origin https://github.com/ColmMac/cs_practice_lab.git
  ```
  ```powershell
  git remote -v
  ```
  GitHub redirects the old URL, but update every reference anyway. In Cloudflare Pages, confirm the Git integration still points at the renamed repo, and trigger a deploy to prove it.
- [ ] New `README.md`: a one-line pitch and a link to https://cspracticelab.com, the four tools (one short paragraph each), architecture highlights (Pyodide in a worker, every-line trace with pure TS projections, language-neutral `src/core`, sanitised share links that never auto-run, a CSP-first static deploy), local dev and test commands (the table from the current README, including the Windows `uv` note), **Cloudflare Pages deployment** (build `npm run build`, output `dist`, Node version, env vars, custom domain, `_headers`/`_redirects`), and **Activating Google AdSense**:
  1. Get approved, then note your `ca-pub-…` ID and create one display ad unit (its numeric slot ID).
  2. Pages → Settings → Environment variables (Production): `VITE_ADSENSE_CLIENT`, `VITE_ADSENSE_SLOT`.
  3. Replace the commented line in `public/ads.txt` with `google.com, pub-…, DIRECT, f08c47fec0942fa0`.
  4. Make sure the Privacy & messaging consent message is published.
  5. Redeploy, check `/ads.txt`, and check the console for CSP violations with ads live.
- [ ] Commit, and push after the owner says so.
- [ ] Final summary to the owner includes: **rename the local folder `C:\ip\trace_table` → `cs_practice_lab` manually after exiting Claude Code.** The project memory under `~/.claude/projects/C--ip-trace-table/` is keyed to the old path and won't follow the folder. Copy it over if it's still wanted.
