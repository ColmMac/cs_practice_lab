import { useLocation } from 'react-router'
import { SITE_NAME, SITE_URL } from '../config/site'

/**
 * Per-route `<title>`, description and canonical link. React 19 hoists these into `<head>`. `title` is the
 * page's own name; the home page passes none and gets the bare brand. A `noindex` page has no canonical.
 */
export function PageMeta({ title, description, noindex }: { title?: string; description: string; noindex?: boolean }) {
  const { pathname } = useLocation()
  return (
    <>
      <title>{title ? `${title} · ${SITE_NAME}` : SITE_NAME}</title>
      <meta name="description" content={description} />
      {noindex ? (
        <meta name="robots" content="noindex" />
      ) : (
        <link rel="canonical" href={`${SITE_URL}${pathname.replace(/\/+$/, '') || '/'}`} />
      )}
    </>
  )
}
