/** Stub movement: evacuating people walk their exit route a fixed distance per step. Replace with fire-aware logic. */
import type { Person, Point, World } from '../types'
import { stagingSpot } from './geometry'
import { pathLengthM, routeFor } from './routing'

export const STEP_DISTANCE_M = 8

export function advanceAlong(points: Point[], distanceM: number): { pos: Point; done: boolean } {
  let remaining = distanceM
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = pathLengthM([a, b])
    if (len >= remaining) {
      if (a.floor !== b.floor) return { pos: remaining >= len / 2 ? b : a, done: false }
      const t = len === 0 ? 1 : remaining / len
      return { pos: { floor: a.floor, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, done: false }
    }
    remaining -= len
  }
  return { pos: points[points.length - 1], done: true }
}

export function stepPeople(world: World, now: number = Date.now()): Person[] {
  let evacuated = world.people.filter((p) => p.status === 'evacuated').length
  return world.people.map((person) => {
    if (person.status !== 'evacuating') return person
    const route = routeFor(person, world)
    if (route.blocked || route.points.length < 2) return person
    const { pos, done } = advanceAlong(route.points, STEP_DISTANCE_M)
    if (!done) return { ...person, pos, lastUpdate: now }
    const spot = stagingSpot(evacuated)
    evacuated += 1
    return { ...person, status: 'evacuated', priority: 'safe', pos: spot, lastUpdate: now }
  })
}
