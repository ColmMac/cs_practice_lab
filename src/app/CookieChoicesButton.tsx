import { useEffect, useState } from 'react'
import { Button } from '../components/ui/Button'

declare global {
  interface Window {
    /** Google's consent tool ("Funding Choices"), which the AdSense tag loads. Absent without ads or when blocked. */
    googlefc?: { showRevocationMessage?: () => void }
  }
}

const POLL_MS = 500
const POLL_LIMIT = 20

const consentToolReady = () => typeof window.googlefc?.showRevocationMessage === 'function'

/** Reopens the consent message. Hidden until the consent tool exists, which can be a while after the page does. */
export function CookieChoicesButton() {
  const [ready, setReady] = useState(consentToolReady)

  useEffect(() => {
    if (ready) return
    let tries = 0
    const timer = setInterval(() => {
      if (consentToolReady()) setReady(true)
      else if (++tries < POLL_LIMIT) return
      clearInterval(timer)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [ready])

  if (!ready) return null
  return <Button onClick={() => window.googlefc?.showRevocationMessage?.()}>Manage cookie choices</Button>
}
