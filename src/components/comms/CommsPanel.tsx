import { Panel } from '../ui/Panel'
import { PanelHeader } from '../ui/PanelHeader'

export function CommsPanel({ className }: { className?: string }) {
  return (
    <Panel className={className}>
      <PanelHeader title="Communication" />
    </Panel>
  )
}
