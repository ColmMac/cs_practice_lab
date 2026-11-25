import { ABOUT } from './info/content'
import { InfoPage } from './InfoPage'

export function AboutPage() {
  return <InfoPage path="/about" doc={ABOUT} />
}
