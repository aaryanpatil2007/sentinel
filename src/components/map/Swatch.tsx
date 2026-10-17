import { cn } from '../../lib/cn'

export type SwatchKind = 'fire' | 'smoke' | 'risk' | 'rescue' | 'evacuation' | 'resident'

export function Swatch({ kind, muted }: { kind: SwatchKind; muted?: boolean }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden className={cn('shrink-0', muted && 'opacity-40')}>
      {kind === 'fire' && <rect width="16" height="10" rx="2" className="fill-error" />}
      {kind === 'smoke' && <rect width="16" height="10" rx="2" className="fill-on-surface-variant" opacity={0.3} />}
      {kind === 'risk' && <rect width="16" height="10" rx="2" className="fill-error" opacity={0.25} />}
      {kind === 'rescue' && <line x1="1" y1="5" x2="15" y2="5" className="stroke-primary" strokeWidth={3} strokeLinecap="round" />}
      {kind === 'evacuation' && <line x1="1" y1="5" x2="15" y2="5" className="stroke-primary" strokeWidth={3} strokeDasharray="4 3" />}
      {kind === 'resident' && <line x1="1" y1="5" x2="15" y2="5" className="stroke-primary" strokeWidth={4} strokeDasharray="4 3" />}
    </svg>
  )
}
