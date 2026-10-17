import { useRef, useState } from 'react'
import { useNow } from '../../hooks/useNow'
import { formatElapsed } from '../../lib/format'
import { useSentinel } from '../../store'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'

export const INCIDENT_NAME = 'Jacobs Hall'
export const INCIDENT_ADDRESS = '2530 Ridge Rd, Berkeley'
const OFFLINE_ELAPSED_MS = 14 * 60_000

/**
 * Elapsed time runs from the earliest civilian report seen when the engine first goes live, latched so later
 * updates or status changes never move it. Until then (or if never live) it is a fixed 14 minutes into the recording.
 */
function useIncidentStart(): number {
  const [loadedAt] = useState(() => Date.now())
  const latched = useRef<number | null>(null)
  const live = useSentinel((s) => s.engineStatus === 'live')
  const snapshot = useSentinel((s) => s.snapshot)
  if (latched.current === null && live && snapshot) {
    const times = snapshot.entities
      .filter((e) => e.entity_type === 'civilian')
      .map((e) => Date.parse(e.last_updated))
      .filter((t) => Number.isFinite(t))
    if (times.length) latched.current = Math.min(...times)
  }
  return latched.current ?? loadedAt - OFFLINE_ELAPSED_MS
}

export function IncidentStatus() {
  const startedAt = useIncidentStart()
  const now = useNow()
  return (
    <div className="flex items-center gap-4">
      <div className="hidden min-w-0 text-right lg:block">
        <div className="truncate text-14 font-medium">{INCIDENT_NAME}</div>
        <div className="truncate text-12 text-on-surface-variant">{INCIDENT_ADDRESS}</div>
      </div>
      <div className="flex items-center gap-2 text-12 font-medium text-error">
        <StatusDot tone="critical" />
        Active
      </div>
      <MonoText className="text-14 font-medium" aria-label="Elapsed time">
        {formatElapsed(now - startedAt)}
      </MonoText>
    </div>
  )
}
