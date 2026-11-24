import { useStore } from '../../store'

export function InputsPanel() {
  const { stdinText, setStdinText } = useStore()
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
        Program inputs <span className="font-normal">(one line per input() call)</span>
      </span>
      <textarea
        value={stdinText}
        onChange={(e) => setStdinText(e.target.value)}
        rows={3}
        spellCheck={false}
        placeholder="Leave empty if your program doesn't call input()"
        className="w-full resize-y rounded border border-slate-300 bg-white p-2 font-mono text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      />
    </label>
  )
}
