import { HardHat, House, ShieldCheck } from 'lucide-react'
import type { Perspective } from '../../types'
import { useSentinel } from '../../store'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'
import { DevMenu } from './DevMenu'
import { EngineStatus } from './EngineStatus'
import { IncidentStatus } from './IncidentStatus'

const PERSPECTIVES: SegmentOption<Perspective>[] = [
  { value: 'firefighter', label: 'Firefighter', icon: HardHat },
  { value: 'resident', label: 'Resident', icon: House },
]

export function TopBar() {
  const perspective = useSentinel((s) => s.perspective)
  const setPerspective = useSentinel((s) => s.setPerspective)
  return (
    <header className="grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center border-b border-outline bg-surface px-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={20} strokeWidth={1.75} className="text-primary" aria-hidden />
        <span className="text-18 font-semibold tracking-tightest">Sentinel</span>
      </div>
      <SegmentedControl
        ariaLabel="Perspective"
        layoutId="perspective"
        options={PERSPECTIVES}
        value={perspective}
        onChange={setPerspective}
      />
      <div className="flex items-center justify-end gap-2">
        <EngineStatus />
        <IncidentStatus />
        <span aria-hidden className="mx-2 h-5 w-px bg-outline" />
        <DevMenu />
      </div>
    </header>
  )
}
