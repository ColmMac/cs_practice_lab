import { FAQ_HEADING, guideSections, type Guide, type GuideBlock, type GuideSection } from './guides'
import { LINK_CLASSES } from '../components/ui/links'
import { BlockView, Text } from './Prose'

const heading = 'text-base font-semibold'
// a box that can scroll sideways on a phone has to be reachable by keyboard
const scrollBox = 'overflow-x-auto rounded border border-border focus-visible:outline-2 focus-visible:outline-accent'
const cell = 'border border-border px-2 py-1 text-left whitespace-nowrap'

function GuideBlockView({ block }: { block: GuideBlock }) {
  if ('code' in block) {
    return (
      <pre tabIndex={0} aria-label="Program listing" role="region" className={`${scrollBox} bg-surface p-3 font-mono text-xs`}>
        <code>{block.code}</code>
      </pre>
    )
  }
  if ('table' in block) {
    const { caption, head, rows } = block.table
    return (
      <div tabIndex={0} role="group" aria-label={caption} className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-accent">
        <table className="border-collapse font-mono text-xs tabular-nums">
          <caption className="pb-1 text-left font-sans text-text-muted">{caption}</caption>
          <thead className="bg-surface">
            <tr>
              {head.map((h) => (
                <th key={h} scope="col" className={cell}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((value, j) => (
                  <td key={j} className={cell}>
                    {value}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  if ('example' in block) {
    return (
      <p>
        <a href={block.example.href} className={LINK_CLASSES.inline}>
          {block.example.text}
        </a>
      </p>
    )
  }
  return <BlockView block={block} />
}

function Section({ section }: { section: GuideSection }) {
  return (
    <div className="space-y-3 pt-2">
      <h3 className={heading}>{section.heading}</h3>
      {section.blocks.map((b, i) => (
        <GuideBlockView key={i} block={b} />
      ))}
    </div>
  )
}

/**
 * The written guide under a tool's workspace. The page leaves it out in Study mode, a challenge, practice and the
 * quiz (its worked example would be an answer sheet), and passes `PageMeta` the FAQ only when it is shown.
 */
export function ToolGuide({ guide }: { guide: Guide }) {
  return (
    <section aria-labelledby="tool-guide" className="border-t border-border px-4 py-6 projector:hidden print:hidden">
      <div className="max-w-prose space-y-3 text-sm leading-relaxed">
        <h2 id="tool-guide" className="text-lg font-semibold">
          {guide.title}
        </h2>
        <p>
          <Text parts={guide.intro} />
        </p>
        {guideSections(guide).map((s) => (
          <Section key={s.heading} section={s} />
        ))}
        <div className="space-y-3 pt-2">
          <h3 className={heading}>{FAQ_HEADING}</h3>
          {guide.faq.map((f) => (
            <div key={f.question} className="space-y-1">
              <h4 className="font-semibold">{f.question}</h4>
              <p>{f.answer}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
