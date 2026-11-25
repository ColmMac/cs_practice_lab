import { Link } from 'react-router'
import { LINK_CLASSES } from '../components/ui/links'
import type { Block, Inline } from './info/content'

export function Text({ parts }: { parts: Inline[] }) {
  return parts.map((part, i) => {
    if (typeof part === 'string') return part
    return part.href.startsWith('/') ? (
      <Link key={i} to={part.href} className={LINK_CLASSES.inline}>
        {part.text}
      </Link>
    ) : (
      <a key={i} href={part.href} className={LINK_CLASSES.inline}>
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
