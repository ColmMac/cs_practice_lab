import { useRef, useState } from 'react'
import { challengeLinkBlocker, useStore, type ChallengeLink } from '../../store'
import { Button } from '../ui/Button'
import { Popover } from '../ui/Popover'
import { GraduationCap } from 'lucide-react'
import { ICON_BEFORE } from '../ui/icons'

/** For teachers: a link that opens this table as a study-mode challenge, with the current Study mode mask. */
export function ChallengeLinkButton() {
  const blocker = useStore((s) => challengeLinkBlocker(s))
  const challengeLink = useStore((s) => s.challengeLink)
  const [link, setLink] = useState<ChallengeLink | null>(null)
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)
  const field = useRef<HTMLInputElement>(null)

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied('yes')
    } catch {
      field.current?.select() // clipboard blocked: the link is selected so Ctrl+C works
      setCopied('no')
    }
  }

  const onToggle = (open: boolean) => {
    if (!open) return
    const next = challengeLink()
    setLink(next)
    setCopied(null)
    if (next && !next.unreadable) void copy(next.url)
  }

  if (blocker) {
    return (
      <Button disabled title={blocker}>
        <GraduationCap aria-hidden="true" className={ICON_BEFORE} />
        Copy student challenge link
      </Button>
    )
  }

  return (
    <Popover
      label="Student challenge link"
      onToggle={onToggle}
      trigger={(p) => (
        <Button {...p} title="A link that opens this table with cells hidden">
          <GraduationCap aria-hidden="true" className={ICON_BEFORE} />
          Copy student challenge link
        </Button>
      )}
    >
      {link?.unreadable && (
        <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
          This challenge is too big to fit in a link that will open. Use a shorter program, or choose fewer cells by hand.
        </p>
      )}
      {link && !link.unreadable && (
        <>
          <p role="status" className="mb-2 text-xs">
            {copied === 'yes' && 'Challenge link copied to the clipboard.'}
            {copied === 'no' && 'Couldn’t copy automatically — the link is selected, press Ctrl/⌘+C.'}
            {copied === null && 'Copying…'}
          </p>
          <input
            ref={field}
            readOnly
            value={link.url}
            aria-label="Student challenge link"
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
          />
          <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">
            {link.hidden === 0
              ? `These settings hide nothing in this table, so students would be asked for ${link.fallback} of ${link.total} cells (all but the starting values).`
              : `Students fill in ${link.hidden} of ${link.total} cells.`}{' '}
            To change which, use Study mode, then copy the link again.
          </p>
          <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
            {link.length.toLocaleString()} characters; nothing is uploaded. It contains the program, so it is practice, not a secure
            test: a determined student can run the code.
          </p>
          {link.tooLong && (
            <p role="alert" className="mt-2 text-xs text-amber-800 dark:text-amber-300">
              This link is long; some chat apps and sites cut off long links. Consider a shorter program or fewer hand-picked cells.
            </p>
          )}
          <button
            type="button"
            onClick={() => void copy(link.url)}
            className="mt-2 rounded bg-accent-fill px-2.5 py-1 text-xs font-medium text-on-accent hover:bg-accent-fill-hover"
          >
            Copy again
          </button>
        </>
      )}
    </Popover>
  )
}
