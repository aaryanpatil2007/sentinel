import { motion } from 'framer-motion'
import type { Entity, Recommendation } from '../../engine/types'
import { civilianStatus, civilianTone, peopleCount, placeLabel } from '../../engine/derive'
import { cn } from '../../lib/cn'
import { RESPONDER_LABEL, REVIEW_PRIORITY_LABEL } from '../../lib/labels'
import { STANDARD } from '../../lib/motion'
import { useSentinel } from '../../store'
import { useCivilians, useNodes } from '../../store/selectors'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'

type Row = { rank: number; civilian: Entity; rec: Recommendation }

function PriorityRow({ row, selected, onSelect, onHover }: { row: Row; selected: boolean; onSelect: (id: string) => void; onHover: (id: string | null) => void }) {
  const nodes = useNodes()
  const { civilian, rec } = row
  const evacuated = civilianStatus(civilian, nodes) === 'evacuated'
  return (
    <motion.li layout transition={STANDARD}>
      <button
        type="button"
        onClick={() => onSelect(civilian.entity_id)}
        onMouseEnter={() => onHover(civilian.entity_id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(civilian.entity_id)}
        onBlur={() => onHover(null)}
        aria-current={selected ? 'true' : undefined}
        className={cn('state-layer focus-ring relative flex w-full items-start gap-2 rounded-8 px-2 py-2 text-left', selected && 'bg-surface-container-high')}
      >
        {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-primary" />}
        <MonoText className="w-4 shrink-0 pt-0.5 text-12 text-on-surface-variant">{row.rank}</MonoText>
        <StatusDot tone={civilianTone(civilian, nodes)} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className="truncate text-14 font-semibold">{placeLabel(civilian, nodes)}</span>
            <MonoText className="text-12 text-on-surface-variant">· {peopleCount(civilian)}</MonoText>
          </div>
          <p className="line-clamp-2 text-12 text-on-surface-variant">{evacuated ? 'At staging' : rec.reason}</p>
        </div>
        {!evacuated && (
          <div className="shrink-0 text-right">
            <MonoText className="block text-12">{REVIEW_PRIORITY_LABEL[rec.priority]}</MonoText>
            <MonoText className="block text-12 text-on-surface-variant">
              {rec.nearest_responder_id ? RESPONDER_LABEL[rec.nearest_responder_id] ?? rec.nearest_responder_id : 'No route'}
            </MonoText>
          </div>
        )}
      </button>
    </motion.li>
  )
}

export function PriorityList({ className }: { className?: string }) {
  const recommendations = useSentinel((s) => s.recommendations)
  const selectedId = useSentinel((s) => s.selectedCivilianId)
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const hoverCivilian = useSentinel((s) => s.hoverCivilian)
  const civilians = useCivilians()
  const nodes = useNodes()

  const rows: Row[] = recommendations.flatMap((rec, i) => {
    const civilian = civilians.find((c) => c.entity_id === rec.civilian_id)
    return civilian ? [{ rank: i + 1, civilian, rec }] : []
  })
  const active = rows.filter((r) => civilianStatus(r.civilian, nodes) !== 'evacuated')
  const out = rows.filter((r) => civilianStatus(r.civilian, nodes) === 'evacuated')
  const render = (row: Row) => (
    <PriorityRow key={row.civilian.entity_id} row={row} selected={row.civilian.entity_id === selectedId} onSelect={selectCivilian} onHover={hoverCivilian} />
  )

  return (
    <aside aria-label="Rescue priority" className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex h-10 shrink-0 items-center justify-between px-4">
        <h3 className="text-12 font-medium text-on-surface-variant">Rescue priority</h3>
        <MonoText className="text-12 text-on-surface-variant">{active.length}</MonoText>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {active.map(render)}
        {out.length > 0 && (
          <li role="presentation" className="px-2 pb-1 pt-4 text-12 font-medium text-on-surface-variant">
            Evacuated
          </li>
        )}
        {out.map(render)}
      </ol>
      <p className="shrink-0 border-t border-outline px-4 py-2 text-11 text-on-surface-variant">Engine proposals · command approval required</p>
    </aside>
  )
}
