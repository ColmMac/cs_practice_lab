# UI primitives and design tokens

Every tool in the hub uses these, so all pages look the same. Tailwind v4: there is no config file; the tokens are the class strings.

| Token | Value |
|-------|-------|
| Page surface | `bg-white dark:bg-slate-950`, text `text-slate-900 dark:text-slate-100` |
| Raised strip / header | `bg-slate-50 dark:bg-slate-900`; table head `bg-slate-100 dark:bg-slate-800` |
| Border | `border-slate-300 dark:border-slate-700` (`rounded`) |
| Muted text | `text-slate-600 dark:text-slate-400` |
| Accent | `emerald-700` (hover `emerald-800`), white text |
| Danger | `red-600` (hover `red-700`) |
| Focus ring | `focus-visible:outline-2 focus-visible:outline-emerald-700` (`-outline-offset-2` inside tight boxes) |
| Type scale | `text-base` titles, `text-sm` controls and tables, `text-xs` hints and badges |
| Spacing | controls `px-2 py-1`, primary `px-3 py-1.5`, panels `p-3`, page gutter `p-4`, gaps `gap-3` |

Dark mode is the `.dark` class on `<html>` (custom variant in `src/styles/index.css`). Every colour needs a `dark:` pair and must pass WCAG AA in both themes.

## Components

- `Button` – `variant`: `primary` (emerald), `danger`, `toolbar` (outline, default), `small`.
- `SegmentedToggle` – radio group drawn as buttons (`components/table/Segmented` re-exports it).
- `Badge` – `tone`: `neutral | warn | ok | info | error`; `role="status"`.
- `Panel` – bordered section with an optional title.
- `ToolHeader` – title plus toolbar slot.
- `Popover` – trigger render-prop plus a dialog that closes on Escape or an outside click (`usePopover` underneath).
- `tableStyles` – `TABLE`, `THEAD`, `TH`, `TD` class constants for data tables.
- `ThemeToggle`, `theme.ts` – shared light/dark store (`tts:theme`).

`tests/unit/uiPrimitives.test.tsx` pins these class strings; change one deliberately or not at all.
