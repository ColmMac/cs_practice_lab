import { useLocation } from 'react-router'
import { BRAND } from './tools'

/** Origin of the production site (no trailing slash), or '' when `VITE_SITE_URL` is unset. */
export function siteUrl(raw: string | undefined = import.meta.env.VITE_SITE_URL): string {
  return (raw ?? '').trim().replace(/\/+$/, '')
}

/**
 * Per-route `<title>`, description and (when `VITE_SITE_URL` is set) canonical link. React 19 hoists these
 * into `<head>`. `title` is the page's own name; the home page passes none and gets the bare brand.
 */
export function PageMeta({ title, description, noindex }: { title?: string; description: string; noindex?: boolean }) {
  const { pathname } = useLocation()
  const origin = siteUrl()
  return (
    <>
      <title>{title ? `${title} · ${BRAND}` : BRAND}</title>
      <meta name="description" content={description} />
      {noindex && <meta name="robots" content="noindex" />}
      {origin && <link rel="canonical" href={`${origin}${pathname === '/' ? '/' : pathname.replace(/\/+$/, '')}`} />}
    </>
  )
}
