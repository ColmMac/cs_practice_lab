/**
 * The site's identity, in one place. `vite.config.ts` imports this in Node, so keep it free of React, the store
 * and anything that needs a browser.
 */
const DEFAULT_SITE_URL = 'https://cspracticelab.com'

/** An origin as we join paths onto it: trimmed, no trailing slash. '' when there is nothing to normalise. */
export function normaliseOrigin(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

/** The origin to publish: `VITE_SITE_URL` when it has a value, otherwise production. */
export function resolveSiteUrl(raw: string | undefined): string {
  return normaliseOrigin(raw) || DEFAULT_SITE_URL
}

// Vite fills `import.meta.env` in the app. In Node (the config file) it does not exist, hence the `?.`;
// config code passes what `loadEnv` returned to `resolveSiteUrl` itself.
export const SITE_URL = resolveSiteUrl(import.meta.env?.VITE_SITE_URL)

/** A well-formed AdSense publisher ID. Anything else (including nothing) means this build has no adverts. */
export function isAdsenseClient(raw: string | undefined): boolean {
  return /^ca-pub-\d{16}$/.test(raw ?? '')
}

export const SITE_NAME = 'CS Practice Lab'

export const SITE_DESCRIPTION =
  'Free computer science revision tools for GCSE, SQA Higher, A-Level and CS1: trace tables, truth tables, number systems and sorting. No login, runs in your browser.'

export const CONTACT_EMAIL = 'contact@cspracticelab.com'

export const REPO_URL = 'https://github.com/ColmMac/cs_practice_lab'
