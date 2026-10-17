import type { Priority } from '../../types'
import { PRIORITY_LABEL } from '../../lib/labels'
import { StatusDot } from '../ui/StatusDot'
import { Swatch, type SwatchKind } from './Swatch'

const PRIORITIES: Priority[] = ['critical', 'moderate', 'safe']

const SWATCHES: Record<'firefighter' | 'resident', { kind: SwatchKind; label: string }[]> = {
  firefighter: [
    { kind: 'rescue', label: 'Rescue route' },
    { kind: 'evacuation', label: 'Evacuation route' },
    { kind: 'fire', label: 'Fire' },
    { kind: 'smoke', label: 'Smoke' },
    { kind: 'risk', label: 'Predicted spread' },
  ],
  resident: [
    { kind: 'resident', label: 'Your route' },
    { kind: 'fire', label: 'Fire' },
    { kind: 'smoke', label: 'Smoke' },
  ],
}

export function Legend({ variant }: { variant: 'firefighter' | 'resident' }) {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-12 text-on-surface-variant">
      {variant === 'firefighter' &&
        PRIORITIES.map((p) => (
          <li key={p} className="flex items-center gap-1">
            <StatusDot tone={p} />
            {PRIORITY_LABEL[p]}
          </li>
        ))}
      {SWATCHES[variant].map((s) => (
        <li key={s.kind} className="flex items-center gap-1">
          <Swatch kind={s.kind} />
          {s.label}
        </li>
      ))}
    </ul>
  )
}
