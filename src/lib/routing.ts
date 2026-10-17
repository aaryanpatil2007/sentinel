/**
 * Stub router. Replace with real pathfinding; keep these signatures.
 * Walks a fixed waypoint graph: unit door → hallway → stairwell → down → exit.
 * Fire (not smoke) on any leg after the person's own doorway blocks that stair.
 */
import type { Floor, Person, Point, Route, StairId, World } from '../types'
import {
  FLOOR_CHANGE_M,
  HALL,
  METERS_PER_UNIT,
  STAGING,
  STAIRS,
  WALK_SPEED_MPS,
  doorFor,
  isAtStaging,
  pointOn,
  unitAt,
} from './geometry'
import { hazardAt, maxHazardAlong } from './grid'

export const STRUCTURAL_PENALTY_M = 20
const STAIR_IDS: readonly StairId[] = ['A', 'B']

const round1 = (n: number) => Math.round(n * 10) / 10

function samePoint(a: Point, b: Point): boolean {
  return a.floor === b.floor && a.x === b.x && a.y === b.y
}

function dedupe(points: Point[]): Point[] {
  return points.filter((p, i) => i === 0 || !samePoint(p, points[i - 1]))
}

export function exitPath(person: Person, stair: StairId): Point[] {
  const { floor } = person.pos
  const s = STAIRS[stair]
  const door = doorFor(person.pos)
  const descent: Point[] = []
  for (let f = floor - 1; f >= 1; f--) descent.push(pointOn(f as Floor, s.center))
  return dedupe([
    person.pos,
    pointOn(floor, door),
    pointOn(floor, { x: door.x, y: HALL.y }),
    pointOn(floor, s.entry),
    pointOn(floor, s.center),
    ...descent,
    pointOn(1, s.exit),
  ])
}

export function pathLengthM(points: Point[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    total +=
      a.floor === b.floor
        ? Math.hypot(b.x - a.x, b.y - a.y) * METERS_PER_UNIT
        : Math.abs(a.floor - b.floor) * FLOOR_CHANGE_M
  }
  return total
}

export function isPathBlocked(points: Point[], world: World): boolean {
  // Someone inside a unit is already in that room; only legs from the doorway on can block them.
  const start = unitAt(points[0]) ? 2 : 1
  for (let i = start; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    if (a.floor === b.floor) {
      if (maxHazardAlong(world.hazards, a.floor, a, b) === 2) return true
    } else if (hazardAt(world.hazards, b) === 2) {
      return true
    }
  }
  return false
}

function structuralPenaltyM(points: Point[], world: World): number {
  const inside = (p: Point) =>
    world.structural.some((r) => r.floor === p.floor && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h)
  return points.some(inside) ? STRUCTURAL_PENALTY_M : 0
}

type Candidate = { stair: StairId; points: Point[]; blocked: boolean; lengthM: number; cost: number }

function bestCandidate(person: Person, world: World): Candidate {
  const candidates = STAIR_IDS.map((stair): Candidate => {
    const points = exitPath(person, stair)
    const lengthM = pathLengthM(points)
    return { stair, points, blocked: isPathBlocked(points, world), lengthM, cost: lengthM + structuralPenaltyM(points, world) }
  }).sort((a, b) => a.cost - b.cost)
  return candidates.find((c) => !c.blocked) ?? candidates[0]
}

function noRoute(personId: string, kind: Route['kind']): Route {
  return { personId, kind, points: [], via: null, blocked: false, distanceM: 0, etaS: 0 }
}

function hasLeft(person: Person): boolean {
  return person.status === 'evacuated' || isAtStaging(person.pos)
}

export function routeFor(person: Person, world: World): Route {
  if (hasLeft(person)) return noRoute(person.id, 'exit')
  const best = bestCandidate(person, world)
  return {
    personId: person.id,
    kind: 'exit',
    points: best.points,
    via: best.stair,
    blocked: best.blocked,
    distanceM: round1(best.lengthM),
    etaS: Math.round(best.lengthM / WALK_SPEED_MPS),
  }
}

export function entryRouteFor(person: Person, world: World): Route {
  if (hasLeft(person)) return noRoute(person.id, 'entry')
  const best = bestCandidate(person, world)
  const inbound = best.points.slice(0, -1).reverse()
  const crossover = best.stair === 'A' ? [pointOn(1, STAIRS.B.entry), pointOn(1, STAIRS.A.entry)] : []
  const points = dedupe([STAGING, pointOn(1, STAIRS.B.exit), ...crossover, ...inbound])
  const lengthM = pathLengthM(points)
  return {
    personId: person.id,
    kind: 'entry',
    points,
    via: best.stair,
    blocked: false,
    distanceM: round1(lengthM),
    etaS: Math.round(lengthM / WALK_SPEED_MPS),
  }
}

export function getRescueRoutes(world: World): Route[] {
  return world.people
    .filter((p) => p.priority === 'critical' && p.status !== 'evacuated')
    .map((p) => entryRouteFor(p, world))
}

export function sameFloorLegM(route: Route): number {
  const pts = route.points
  if (pts.length === 0) return 0
  const end = pts.findIndex((p) => p.floor !== pts[0].floor)
  return round1(pathLengthM(end === -1 ? pts : pts.slice(0, end)))
}
