import type { GoStay, Message, Person, RankedPerson, Route, Thread, World } from '../types'
import { rank } from '../lib/priority'
import { getRescueRoutes, routeFor } from '../lib/routing'
import { useSentinel } from './index'

export type Derived = {
  exitRoutes: Record<string, Route>
  rescueRoutes: Route[]
  ranked: RankedPerson[]
}

let cache: { world: World; derived: Derived } | null = null

/** Memoized on world identity, so every component shares one computation per world change. */
export function deriveWorld(world: World): Derived {
  if (cache && cache.world === world) return cache.derived
  const exitRoutes = Object.fromEntries(world.people.map((p) => [p.id, routeFor(p, world)]))
  const rescueRoutes = getRescueRoutes(world)
  const derived = { exitRoutes, rescueRoutes, ranked: rank(world, rescueRoutes) }
  cache = { world, derived }
  return derived
}

export function useDerived(): Derived {
  return deriveWorld(useSentinel((s) => s.world))
}

export function usePerson(id: string | null): Person | undefined {
  return useSentinel((s) => (id ? s.world.people.find((p) => p.id === id) : undefined))
}

export function useThread(id: string): Thread | undefined {
  return useSentinel((s) => s.threads.find((t) => t.id === id))
}

export function effectiveRoute(route: Route, override: GoStay): Route {
  return override === 'auto' ? route : { ...route, blocked: override === 'stay' }
}

export function lastResidentMessage(thread: Thread | undefined): Message | undefined {
  return thread?.messages.filter((m) => m.from === 'resident').at(-1)
}
