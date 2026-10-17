import { cn } from '../../lib/cn'
import { splitEmphasis } from '../../lib/format'

export function Emphasis({ text, strongClassName }: { text: string; strongClassName?: string }) {
  return (
    <>
      {splitEmphasis(text).map((part, i) =>
        part.strong ? (
          <strong key={i} className={cn('font-semibold', strongClassName)}>
            {part.text}
          </strong>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  )
}
