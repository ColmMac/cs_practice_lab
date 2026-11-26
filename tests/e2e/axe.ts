import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'

/** WCAG 2.1 levels A and AA, the target the /accessibility page states. */
export const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

/**
 * The only things any audit leaves out: frames that AdSense and its consent message put on the page. Their documents
 * are Google's, so a problem inside one can't be fixed here. Our own markup around them, the ad slot included, is
 * audited. Never add a rule exclusion or one of our own elements to get a test to pass.
 */
const THIRD_PARTY_FRAMES = [
  'iframe[id^="aswift_"]', // AdSense's ad frames
  'iframe[id^="google_ads_iframe"]',
  'iframe[name="googlefcPresent"]', // the consent message's marker frame
  'iframe[src*="fundingchoicesmessages.google.com"]',
]

/**
 * axe on the real page: one line per violated rule, with the elements that violate it, so a failed
 * `toEqual([])` says what to fix. Every rule runs (best practices too) unless `tags` narrows it.
 * AxeBuilder injects axe through the DevTools protocol, so the production CSP stays in force.
 */
export async function axeViolations(page: Page, { tags }: { tags?: string[] } = {}): Promise<string[]> {
  // colours must be audited at rest, not part-way through a fade
  await page.waitForTimeout(400)
  let builder = new AxeBuilder({ page })
  if (tags) builder = builder.withTags(tags)
  for (const frame of THIRD_PARTY_FRAMES) builder = builder.exclude(frame)
  const { violations } = await builder.analyze()
  return violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' ; ')}`)
}
