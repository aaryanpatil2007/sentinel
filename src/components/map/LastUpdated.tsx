import { formatClock } from '../../lib/format'
import { useSentinel } from '../../store'
import { MonoText } from '../ui/MonoText'

export function LastUpdated() {
  const updatedAt = useSentinel((s) => s.updatedAt)
  return <MonoText className="shrink-0 text-12 text-on-surface-variant">Updated {formatClock(updatedAt)}</MonoText>
}
