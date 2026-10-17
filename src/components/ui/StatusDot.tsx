import { cn } from '../../lib/cn'
import { TONE_BG, type Tone } from './tone'

export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', TONE_BG[tone], className)} />
}
