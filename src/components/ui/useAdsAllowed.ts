import { useCallback, useState } from 'react'

export interface Ads {
  /** none: render nothing · house: our own card, no ad request · ad: the slot may ask for an advert. */
  show: 'none' | 'house' | 'ad'
  /** The ad request for this visit has been used up. */
  retire: () => void
}

/**
 * What a page's ad slot may show. Call it in the PAGE component, which lives exactly as long as the route visit:
 * `suppressed` (Study mode, a quiz, practice, a challenge, projector mode) hides the slot, and from then until the
 * next route change it only gets the house card, so switching a mode on and off never sends a new ad request.
 */
export function useAdsAllowed(suppressed: boolean): Ads {
  const [retired, setRetired] = useState(suppressed)
  if (suppressed && !retired) setRetired(true)
  const retire = useCallback(() => setRetired(true), [])
  return { show: suppressed ? 'none' : retired ? 'house' : 'ad', retire }
}
