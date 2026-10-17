/** Stub ranking: critical, then moderate, then safe; ties broken by distance from staging. */
import type { Priority, RankedPerson, Route, World } from '../types'
import { entryRouteFor } from './routing'

const ORDER: Record<Priority, number> = { critical: 0, moderate: 1, safe: 2 }

export function rank(world: World, routes: Route[]): RankedPerson[] {
  return world.people
    .map((person) => {
      const route = routes.find((r) => r.kind === 'entry' && r.personId === person.id) ?? entryRouteFor(person, world)
      return { person, distanceM: route.distanceM, etaS: route.etaS }
    })
    .sort((a, b) => ORDER[a.person.priority] - ORDER[b.person.priority] || a.distanceM - b.distanceM)
    .map((entry, i) => ({ personId: entry.person.id, rank: i + 1, distanceM: entry.distanceM, etaS: entry.etaS }))
}
