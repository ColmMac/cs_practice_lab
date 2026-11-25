import { Link } from 'react-router'
import type { Block, Inline } from './info/content'

export const linkClass = 'text-accent underline focus-visible:outline-2 focus-visible:outline-accent'

export function Text({ parts }: { parts: Inline[] }) {
  return parts.map((part, i) => {
    if (typeof part === 'string') return part
    return part.href.startsWith('/') ? (
      <Link key={i} to={part.href} className={linkClass}>
        {part.text}
      </Link>
    ) : (
      <a key={i} href={part.href} className={linkClass}>
        {part.text}
      </a>
    )
  })
}

export function BlockView({ block }: { block: Block }) {
  if ('p' in block) {
    return (
      <p>
        <Text parts={block.p} />
      </p>
    )
  }
  return (
    <ul className="list-disc space-y-1 pl-5">
      {block.ul.map((item, i) => (
        <li key={i} className="break-words">
          <Text parts={item} />
        </li>
      ))}
    </ul>
  )
}
