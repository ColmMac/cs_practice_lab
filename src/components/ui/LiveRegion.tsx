import { useAnnouncements } from './announce'

/**
 * The app's one polite live region, mounted by the shell so it exists before any text arrives. Deliberately not
 * `role="status"`: the visible status badges keep that role to themselves.
 */
export function LiveRegion() {
  const items = useAnnouncements()
  return (
    <div aria-live="polite" aria-relevant="additions text" data-testid="live-region" className="sr-only">
      {items.map((item) => (
        <p key={item.id}>{item.text}</p>
      ))}
    </div>
  )
}
