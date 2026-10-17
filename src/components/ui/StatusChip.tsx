import { cn } from '../../lib/cn'
import { StatusDot } from './StatusDot'
import { TONE_TEXT, TONE_TINT, type Tone } from './tone'

type Props = { tone: Tone; label: string; size?: 'md' | 'lg' }

export function StatusChip({ tone, label, size = 'md' }: Props) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-8 border font-medium',
        size === 'lg' ? 'h-8 px-3 text-14' : 'h-6 px-2 text-12',
        TONE_TINT[tone],
        TONE_TEXT[tone],
      )}
    >
      <StatusDot tone={tone} />
      {label}
    </span>
  )
}
