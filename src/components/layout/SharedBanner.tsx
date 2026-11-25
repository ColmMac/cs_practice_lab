import { useStore } from '../../store'

/** Shown while a #s= link's workspace is loaded but not yet kept; and when a link couldn't be read. */
export function SharedBanner() {
  const { shared, sharedLinkInvalid, keepShared, discardShared, dismissInvalidLink, code, challenge, result } = useStore()

  if (sharedLinkInvalid) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-red-300 bg-red-50 px-4 py-2 text-sm text-red-950 dark:border-red-900 dark:bg-red-950/50 dark:text-red-100">
        <span>That share link couldn’t be read (it may be damaged, truncated or from a newer version). Your own workspace is unchanged.</span>
        <button type="button" onClick={dismissInvalidLink} className="rounded border border-red-400 px-2 py-0.5 text-xs">
          Dismiss
        </button>
      </div>
    )
  }
  if (!shared || challenge) return null // a challenge has its own panel and its own way out

  const lines = code.split('\n').length
  return (
    <div role="region" aria-label="Shared workspace" className="flex flex-wrap items-center gap-3 border-b border-sky-300 bg-sky-50 px-4 py-2 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-100">
      <span>
        <strong>Shared workspace</strong> opened from a link ({lines} line{lines === 1 ? '' : 's'} of code).{' '}
        {!result && (
          <>
            <strong>Nothing has been run</strong> — read the code first, then press Run.{' '}
          </>
        )}
        Your own workspace is kept safe until you decide.
        {shared.brokenChallenge && (
          <> This was meant to be a student challenge, but that part of the link is damaged, so it opened as an ordinary shared workspace.</>
        )}
      </span>
      <span className="ml-auto flex gap-2">
        <button type="button" onClick={keepShared} className="rounded bg-sky-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-800">
          Keep this workspace
        </button>
        <button type="button" onClick={discardShared} className="rounded border border-sky-500 px-2.5 py-1 text-xs hover:bg-sky-100 dark:hover:bg-sky-900">
          Discard &amp; restore mine
        </button>
      </span>
    </div>
  )
}
