import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, useLocation } from 'react-router'
import { isAdsenseClient, isAdsenseSlot } from '../../config/site'
import { houseCard } from './houseCards'
import type { Ads } from './useAdsAllowed'
import { useMediaQuery, WIDE_SCREEN } from './useMediaQuery'

declare global {
  interface Window {
    /** AdSense's command queue. The loader script replaces `push` and sets `loaded`. */
    adsbygoogle?: unknown[] & { loaded?: boolean }
  }
}

/** How long the loader may take before we treat it as blocked. */
export const AD_LOAD_TIMEOUT_MS = 5000

/** A fixed CSS height, not an auto format, so a filled ad can't grow the box. Never clipped: cropping breaks policy. */
const UNIT_STYLE: CSSProperties = { display: 'block', width: '100%', height: 100 }

/** Units already asked for: one request per `<ins>`, however often the effect runs. */
const requested = new WeakSet<Element>()

/** The AdSense `<ins>`. `onFail` swaps in the house card; `onRetire` reports that a requested unit has gone. */
export function GoogleAdUnit({
  client,
  slot,
  onFail,
  onRetire,
}: {
  client: string
  slot: string
  onFail: () => void
  onRetire: () => void
}) {
  const ref = useRef<HTMLModElement>(null)

  useEffect(() => {
    const unit = ref.current!
    let sent = false
    // A tick later: a parent effect may be about to suppress ads (the trace page reads a challenge link in one).
    const push = setTimeout(() => {
      if (requested.has(unit) || unit.hasAttribute('data-adsbygoogle-status')) return
      requested.add(unit)
      sent = true
      try {
        ;(window.adsbygoogle ??= []).push({})
      } catch {
        onFail()
      }
    }, 0)

    const observer = new MutationObserver(() => {
      if (unit.getAttribute('data-ad-status') === 'unfilled') onFail()
    })
    observer.observe(unit, { attributes: true, attributeFilter: ['data-ad-status'] })

    // blocked: the script errors, or (if it had already failed) never marks itself as loaded
    const loader = document.querySelector('script[src*="/adsbygoogle.js"]')
    loader?.addEventListener('error', onFail)
    const timeout = setTimeout(() => {
      if (!window.adsbygoogle?.loaded) onFail()
    }, AD_LOAD_TIMEOUT_MS)

    return () => {
      clearTimeout(push)
      clearTimeout(timeout)
      observer.disconnect()
      loader?.removeEventListener('error', onFail)
      if (sent) onRetire()
    }
  }, [onFail, onRetire])

  return (
    <ins
      ref={ref}
      className="adsbygoogle"
      style={UNIT_STYLE}
      data-ad-client={client}
      data-ad-slot={slot}
      data-full-width-responsive="false"
      data-adtest={import.meta.env.DEV ? 'on' : undefined}
    />
  )
}

function HouseAd({ pathname }: { pathname: string }) {
  const card = houseCard(pathname)
  return (
    <p data-testid="house-card" className="flex h-[100px] items-center justify-center px-3 text-center text-sm">
      <span>
        {card.text}{' '}
        <Link to={card.to} className="text-accent underline focus-visible:outline-2 focus-visible:outline-accent">
          {card.link}
        </Link>
      </span>
    </p>
  )
}

/** The box is the same size whatever is in it: loading, filled, unfilled or our own card. */
function AdBox({ ads, pathname, className }: { ads: Ads; pathname: string; className: string }) {
  const [failed, setFailed] = useState(false)
  const onFail = useCallback(() => setFailed(true), [])
  const client = import.meta.env.VITE_ADSENSE_CLIENT
  const slot = import.meta.env.VITE_ADSENSE_SLOT
  const configured = isAdsenseClient(client) && isAdsenseSlot(slot)
  // `retire` only fires once a requested unit has gone, so it never pulls out one that is on screen.
  const unit = configured && ads.show === 'ad' && !failed

  return (
    <div
      data-testid="ad-slot"
      className={`box-border h-[122px] w-full shrink-0 rounded border border-border print:hidden ${className}`}
    >
      {/* our own card isn't an advert, so it isn't labelled as one */}
      <p className="h-5 px-2 text-[11px] leading-5 text-text-muted">{unit ? 'Advertisement' : 'From CS Practice Lab'}</p>
      {unit ? (
        <GoogleAdUnit client={client!} slot={slot!} onFail={onFail} onRetire={ads.retire} />
      ) : (
        <HouseAd pathname={pathname} />
      )}
    </div>
  )
}

/**
 * A page's one ad placement. Where desktop and phone want different spots, put one slot in each with `at`: only the
 * one for the current width is mounted (a hidden AdSense unit has no width, which is an error).
 */
export function AdSlot({ ads, at, className = '' }: { ads: Ads; at?: 'desktop' | 'phone'; className?: string }) {
  const wide = useMediaQuery(WIDE_SCREEN)
  const { pathname } = useLocation()
  if (ads.show === 'none' || (at && (at === 'desktop') !== wide)) return null
  // keyed: each route gets a fresh `<ins>`. Nothing ever refreshes on a timer.
  return <AdBox key={pathname} ads={ads} pathname={pathname} className={className} />
}
