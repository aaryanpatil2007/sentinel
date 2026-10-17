import type { OverlayKind } from '../../types'
import { cn } from '../../lib/cn'
import { useSentinel } from '../../store'
import { Swatch } from './Swatch'

const ITEMS: { kind: OverlayKind; label: string }[] = [
  { kind: 'fire', label: 'Fire' },
  { kind: 'smoke', label: 'Smoke' },
  { kind: 'risk', label: 'Spread risk' },
]

export function OverlayToggles() {
  const overlays = useSentinel((s) => s.overlays)
  const toggleOverlay = useSentinel((s) => s.toggleOverlay)
  return (
    <div role="group" aria-label="Map overlays" className="flex items-center gap-1">
      {ITEMS.map(({ kind, label }) => {
        const on = overlays[kind]
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={on}
            onClick={() => toggleOverlay(kind)}
            className={cn(
              'state-layer focus-ring inline-flex h-8 items-center gap-2 rounded-8 border px-2 text-12 font-medium',
              'transition-colors duration-200 ease-standard',
              on ? 'border-outline bg-surface-container-high text-on-surface' : 'border-transparent text-on-surface-variant',
            )}
          >
            <Swatch kind={kind} muted={!on} />
            {label}
          </button>
        )
      })}
    </div>
  )
}
