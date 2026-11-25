import { useId } from 'react'
import type { WatchExpression } from '../../core/types'
import { LIMITS } from '../../core/workspace'
import { useStore } from '../../store'

const scopeValue = (s: WatchExpression['scope']) => (s.kind === 'function' ? `fn:${s.name}` : s.kind)
const parseScope = (v: string): WatchExpression['scope'] =>
  v === 'module' ? { kind: 'module' } : v.startsWith('fn:') ? { kind: 'function', name: v.slice(3) } : { kind: 'current' }

// A selector must return a STABLE value: `?? []` would create a new array every call and make
// useSyncExternalStore re-render forever.
const NO_FUNCTIONS: readonly string[] = []

/** Read-only expressions (arr[i], len(items), i < n) evaluated after every step and shown as columns. */
export function WatchPanel() {
  const { watches, watchErrors, addWatch, updateWatch, removeWatch } = useStore()
  const functions = useStore((s) => s.result?.functions ?? NO_FUNCTIONS)
  const heading = useId()

  return (
    <section aria-labelledby={heading} className="projector:hidden">
      <div className="mb-1 flex items-center justify-between">
        <h2 id={heading} className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Watch expressions <span className="font-normal">(shown as extra columns)</span>
        </h2>
        <button
          type="button"
          onClick={() => addWatch()}
          disabled={watches.length >= LIMITS.watches}
          className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          + Add watch
        </button>
      </div>

      <ul className="space-y-2">
        {watches.map((w, i) => {
          const error = watchErrors[w.id]
          const errId = `${heading}-err-${w.id}`
          const fnNames = [...new Set([...functions, ...(w.scope.kind === 'function' ? [w.scope.name] : [])])]
          return (
            <li key={w.id}>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={w.enabled}
                  aria-label={`Show watch ${i + 1}`}
                  onChange={(e) => updateWatch(w.id, { enabled: e.target.checked })}
                />
                <input
                  value={w.expr}
                  onChange={(e) => updateWatch(w.id, { expr: e.target.value })}
                  aria-label={`Watch expression ${i + 1}`}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? errId : undefined}
                  placeholder="e.g. arr[i]   len(items)   i < n"
                  spellCheck={false}
                  className={`min-w-0 flex-1 rounded border bg-white px-2 py-1 font-mono text-sm text-slate-900 placeholder:text-slate-500 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-400 ${
                    error ? 'border-red-500' : 'border-slate-300 dark:border-slate-700'
                  }`}
                />
                <select
                  value={scopeValue(w.scope)}
                  onChange={(e) => updateWatch(w.id, { scope: parseScope(e.target.value) })}
                  aria-label={`Scope of watch ${i + 1}`}
                  className="max-w-[9rem] rounded border border-slate-300 bg-white px-1 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="current">Current frame</option>
                  <option value="module">Module (globals)</option>
                  {fnNames.map((n) => (
                    <option key={n} value={`fn:${n}`}>
                      In {n}()
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeWatch(w.id)}
                  aria-label={`Remove watch ${i + 1}`}
                  className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>
              {error && (
                <p id={errId} role="alert" className="mt-1 pl-6 text-xs text-red-700 dark:text-red-300">
                  {error}
                </p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
