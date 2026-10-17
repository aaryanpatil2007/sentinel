import { Crosshair, Radio } from 'lucide-react'
import type { Thread } from '../../types'
import { CIVILIAN_STATUS_LABEL, civilianStatus, civilianTone, peopleCount, placeLabel } from '../../engine/derive'
import type { Entity } from '../../engine/types'
import { formatCoords } from '../../lib/format'
import { useSentinel } from '../../store'
import { useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
import { InlineConfirm } from '../ui/InlineConfirm'
import { MonoText } from '../ui/MonoText'
import { StatusChip } from '../ui/StatusChip'
import { StatusDot } from '../ui/StatusDot'
import { STATUS_TONE } from '../ui/tone'
import { humanizeCondition } from '../map/MarkerCard'

type Props = { thread: Thread; civilian?: Entity; onClear: () => void }

export function ThreadHeader({ thread, civilian, onClear }: Props) {
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const nodes = useNodes()
  const clear = <InlineConfirm label="Clear" prompt="Clear for everyone?" confirmLabel="Clear" onConfirm={onClear} />

  if (!civilian) {
    return (
      <header className="flex shrink-0 items-center gap-2 border-b border-outline px-4 py-3">
        <Radio size={20} strokeWidth={1.75} className="text-on-surface-variant" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-16 font-semibold tracking-tightest">Crew</h2>
          <MonoText className="text-12 text-on-surface-variant">E7 · L3 · BC2 · Alpha · Bravo</MonoText>
        </div>
        {thread.messages.length > 0 && clear}
      </header>
    )
  }

  const status = civilianStatus(civilian, nodes)
  const count = peopleCount(civilian)
  return (
    <header className="shrink-0 border-b border-outline px-4 py-3">
      <div className="flex items-center gap-2">
        <StatusDot tone={civilianTone(civilian, nodes)} />
        <span className="truncate text-16 font-semibold tracking-tightest">{placeLabel(civilian, nodes)}</span>
        <span className="shrink-0 text-14 text-on-surface-variant">
          {count} {count === 1 ? 'person' : 'people'}
        </span>
        <StatusChip tone={STATUS_TONE[status]} label={CIVILIAN_STATUS_LABEL[status]} />
        <span className="flex-1" />
        <Button variant="ghost" size="sm" icon={Crosshair} onClick={() => selectCivilian(civilian.entity_id)}>
          Locate
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <MonoText className="text-12 text-on-surface-variant">{civilian.world_position ? formatCoords(civilian.world_position) : civilian.entity_id}</MonoText>
        {(civilian.priority?.reported_conditions ?? []).map((c) => (
          <span key={c} className="rounded-8 bg-surface-container-high px-2 py-0.5 text-12">
            {humanizeCondition(c)}
          </span>
        ))}
        <span className="flex-1" />
        {thread.messages.length > 0 && clear}
      </div>
    </header>
  )
}
