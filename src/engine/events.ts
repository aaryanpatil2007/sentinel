import type { EngineEvent } from './types'

/** Event types that change what the app shows. advisory_drafted and rescue_prioritized are emitted by the app's own reads. */
export const REFRESH_EVENT_TYPES: ReadonlySet<string> = new Set([
  'entity_registered',
  'entity_location_updated',
  'civilian_report',
  'observation_ingested',
  'hazard_added',
  'hazard_removed',
  'route_computed',
  'route_updated',
])

export function needsRefresh(events: EngineEvent[]): boolean {
  return events.some((e) => REFRESH_EVENT_TYPES.has(e.event_type))
}

export function latestSeq(events: EngineEvent[], current: number): number {
  return events.reduce((max, e) => Math.max(max, e.seq), current)
}
