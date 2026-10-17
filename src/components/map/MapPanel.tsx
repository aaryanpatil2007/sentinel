import { Panel } from '../ui/Panel'
import { PanelHeader } from '../ui/PanelHeader'

export function MapPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <PanelHeader title="Building" />
    </Panel>
  )
}
