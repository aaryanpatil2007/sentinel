import { useSentinel } from '../../store'
import type { EngineStatus as Status } from '../../store/engineSlice'
import { StatusDot } from '../ui/StatusDot'
import type { Tone } from '../ui/tone'

const LABEL: Record<Status, { text: string; tone: Tone }> = {
  live: { text: 'Engine live', tone: 'safe' },
  connecting: { text: 'Connecting', tone: 'neutral' },
  offline: { text: 'Engine offline', tone: 'moderate' },
}

export function EngineStatus() {
  const status = useSentinel((s) => s.engineStatus)
  const { text, tone } = LABEL[status]
  return (
    <span className="hidden items-center gap-2 text-12 font-medium text-on-surface-variant xl:flex" role="status">
      <StatusDot tone={tone} />
      {text}
    </span>
  )
}
