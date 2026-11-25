import { isAdsenseClient } from '../config/site'
import { privacyDoc } from './info/content'
import { InfoPage } from './InfoPage'

const doc = privacyDoc(isAdsenseClient(import.meta.env.VITE_ADSENSE_CLIENT))

export function PrivacyPage() {
  return <InfoPage path="/privacy" doc={doc} />
}
