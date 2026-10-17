import { MapIcon, MessagesSquare } from 'lucide-react'
import { useState } from 'react'
import { useEngineSync } from '../../engine/useEngineSync'
import { cn } from '../../lib/cn'
import { CommsPanel } from '../comms/CommsPanel'
import { MapPanel } from '../map/MapPanel'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'
import { EngineBanner } from './EngineBanner'
import { TopBar } from './TopBar'

type Tab = 'map' | 'comms'
const TABS: SegmentOption<Tab>[] = [
  { value: 'map', label: 'Map', icon: MapIcon },
  { value: 'comms', label: 'Messages', icon: MessagesSquare },
]

export function AppShell() {
  useEngineSync()
  const [tab, setTab] = useState<Tab>('map')
  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <EngineBanner />
      <div className="border-b border-outline px-4 py-2 wide:hidden">
        <SegmentedControl size="sm" ariaLabel="Panel" layoutId="narrow-tab" options={TABS} value={tab} onChange={setTab} />
      </div>
      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 wide:grid-cols-[3fr_2fr]">
        <MapPanel className={cn(tab !== 'map' && 'hidden wide:flex')} />
        <CommsPanel className={cn(tab !== 'comms' && 'hidden wide:flex')} />
      </main>
    </div>
  )
}
