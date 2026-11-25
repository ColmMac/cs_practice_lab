import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'

/** Google's consent tool ("Funding Choices"), which the AdSense tag loads. */
interface GoogleFc {
  /** The tool runs what is queued here, at once if the entry's key has already happened. */
  callbackQueue?: unknown[]
  /** Clears the stored consent answer and shows the message again. */
  showRevocationMessage?: () => void
}

declare global {
  interface Window {
    googlefc?: GoogleFc
  }
}

/** The documented way to call the tool: through its queue, which may be created before the tool has loaded. */
function consentQueue(): unknown[] {
  const fc = (window.googlefc ??= {})
  return (fc.callbackQueue ??= [])
}

/**
 * Reopens the consent message. Hidden until the tool says its API is ready, however long that takes. Without ads,
 * or with the tool blocked, that never happens.
 */
export function CookieChoicesButton() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let mounted = true
    consentQueue().push({
      CONSENT_API_READY: () => {
        if (mounted && typeof window.googlefc?.showRevocationMessage === 'function') setReady(true)
      },
    })
    return () => {
      mounted = false
    }
  }, [])

  if (!ready) return null
  const reopen = () => consentQueue().push(() => window.googlefc?.showRevocationMessage?.())
  return <Button onClick={reopen}>Manage cookie choices</Button>
}
