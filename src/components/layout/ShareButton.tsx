import { useEffect, useId, useRef, useState } from 'react'
import { useStore } from '../../store'
import { Button } from '../ui/Button'
import { POPOVER_PANEL } from '../ui/Popover'
import { Share2 } from 'lucide-react'
import { ICON_BEFORE } from '../ui/icons'

type Link = { url: string; length: number; tooLong: boolean }

/** Builds a #s=… link from the current workspace (code, inputs, view, watches) and offers to copy it. */
export function ShareButton() {
  const shareLink = useStore((s) => s.shareLink)
  const [link, setLink] = useState<Link | null>(null)
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const panelId = useId()

  useEffect(() => {
    if (!link) return
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setLink(null)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setLink(null)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [link])

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('yes')
    } catch {
      field.current?.select() // clipboard blocked: the link is selected so Ctrl+C works
      setCopied('no')
    }
  }

  const open = () => {
    const l = shareLink()
    setLink(l)
    setCopied(null)
    void copy(l.url)
  }

  return (
    <div ref={root} className="relative">
      <Button
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={link !== null}
        aria-controls={link ? panelId : undefined}
      >
        <Share2 aria-hidden="true" className={ICON_BEFORE} />
        Share
      </Button>
      {link && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Share link"
          className={POPOVER_PANEL}
        >
          <p role="status" className="mb-2 text-xs">
            {copied === 'yes' && 'Link copied to the clipboard.'}
            {copied === 'no' && 'Couldn’t copy automatically — the link is selected, press Ctrl/⌘+C.'}
            {copied === null && 'Copying…'}
          </p>
          <input
            ref={field}
            readOnly
            value={link.url}
            aria-label="Share link"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {link.length.toLocaleString()} characters. It contains your code, inputs, watches and column settings; nothing is
            uploaded. Whoever opens it must press Run themselves.
          </p>
          {link.tooLong && (
            <p role="alert" className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              This link is long; some chat apps and sites cut off long links. Consider sharing a shorter program.
            </p>
          )}
          <button
            type="button"
            onClick={() => void copy(link.url)}
            className="mt-2 rounded bg-accent-fill px-2.5 py-1 text-xs font-medium text-on-accent hover:bg-accent-fill-hover"
          >
            Copy again
          </button>
        </div>
      )}
    </div>
  )
}
