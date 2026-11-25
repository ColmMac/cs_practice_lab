# UI primitives and design tokens

Every tool in the hub uses these, so all pages look the same. Tailwind v4: there is no config file; the colour tokens are the `@theme` block in `src/styles/index.css`, with dark values under `.dark`.

| Token | Classes |
|-------|---------|
| Page | `bg-bg text-text` |
| Surfaces | header strips `bg-surface`; popovers `bg-surface-elevated`; table head `bg-surface-strong` |
| Border | `border border-border` (`rounded`, 1 px) |
| Muted text | `text-text-muted` |
| Accent | text, links, focus `text-accent`; filled `bg-accent-fill text-on-accent hover:bg-accent-fill-hover`; tint `bg-accent-soft text-on-accent-soft` |
| Status | `bg-{neutral,ok,warn,info,error}-soft` with `text-on-{…}-soft`; danger button `bg-danger-fill` |
| Sorting states | `border-state-{…} bg-state-{…}-soft` (compare, swap, held, active, sorted), plus found |
| Focus ring | `focus-visible:outline-2 focus-visible:outline-accent` (`-outline-offset-2` inside tight boxes) |
| Shadow | none, except floating layers: `shadow-sm` plus a border |
| Numbers | `tabular-nums` wherever digits line up |
| Icons | `lucide-react` named imports, `aria-hidden`, beside a text label (sizes in `icons.ts`) |
| Type scale | `text-base` titles, `text-sm` controls and tables, `text-xs` hints and badges |
| Spacing | controls `px-2 py-1`, primary `px-3 py-1.5`, panels `p-3`, page gutter `p-4`, gaps `gap-3` |

Dark mode is the `.dark` class on `<html>` (custom variant in `src/styles/index.css`). Tokens switch by themselves; a raw palette colour still needs its own `dark:` pair. Everything must pass WCAG AA in both themes.

## Components

- `Button` – `variant`: `primary` (emerald), `danger`, `toolbar` (outline, default), `small`.
- `SegmentedToggle` – radio group drawn as buttons (`components/table/Segmented` re-exports it).
- `Badge` – `tone`: `neutral | warn | ok | info | error`; `role="status"`.
- `Panel` – bordered section with an optional title.
- `ToolHeader` – title plus toolbar slot.
- `ToolWorkspace` – a tool's header and working area, at least as tall as the screen under the nav (wide screens).
- `Popover` – trigger render-prop plus a dialog that closes on Escape or an outside click (`usePopover` underneath).
- `tableStyles` – `TABLE`, `THEAD`, `TH`, `TD` class constants for data tables.
- `ThemeToggle`, `theme.ts` – shared light/dark store (`tts:theme`).

`tests/unit/uiPrimitives.test.tsx` pins these class strings; change one deliberately or not at all.
