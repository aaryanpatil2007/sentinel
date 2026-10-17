import { describe, expect, it } from 'vitest'
import type { Person, World } from '../types'
import { createMockState } from '../data/mock'
import { STAGING, unitCenter } from './geometry'
import { fillCells } from './grid'
import { entryRouteFor, getRescueRoutes, routeFor, sameFloorLegM } from './routing'

const world = createMockState(0).world
/** Distances are rounded to 0.1 m; allow for x.x5 rounding either way. */
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(0.11)
const person = (id: string, w: World = world): Person => {
  const found = w.people.find((p) => p.id === id)
  if (!found) throw new Error(`missing ${id}`)
  return found
}

describe('routeFor', () => {
  it('routes 2D down Stair B to Exit B', () => {
    const route = routeFor(person('2D'), world)
    expect(route).toMatchObject({ kind: 'exit', via: 'B', blocked: false })
    expect(route.points[0]).toEqual(person('2D').pos)
    expect(route.points.at(-1)).toEqual({ floor: 1, x: 990, y: 150 })
    near(route.distanceM, 18.25)
    expect(route.etaS).toBe(15)
  })

  it('sends 2B to Stair A because fire blocks the hallway toward B', () => {
    expect(routeFor(person('2B'), world)).toMatchObject({ via: 'A', blocked: false })
  })

  it('keeps 3B on Stair B because of the structural risk on Stair A', () => {
    expect(routeFor(person('3B'), world).via).toBe('B')
    expect(routeFor(person('3B'), { ...world, structural: [] }).via).toBe('A')
  })

  it('reports blocked when fire cuts off both stairs', () => {
    let hazards = fillCells(world.hazards, 3, [7, 7], [4, 4], 2)
    hazards = fillCells(hazards, 3, [14, 14], [4, 4], 2)
    const route = routeFor(person('3B'), { ...world, hazards })
    expect(route.blocked).toBe(true)
    expect(route.points.length).toBeGreaterThan(1)
  })

  it('returns no route for evacuated people', () => {
    expect(routeFor(person('1C'), world)).toMatchObject({ points: [], via: null, blocked: false, distanceM: 0 })
  })

  it('checks the first hallway leg for someone standing in the hallway', () => {
    expect(routeFor(person('2G'), world)).toMatchObject({ via: 'B', blocked: false })
    const hazards = fillCells(world.hazards, 2, [20, 20], [4, 4], 2)
    const blockedB = routeFor(person('2G'), { ...world, hazards })
    expect(blockedB.blocked).toBe(true)
  })

  it('never leaves floor 1 for a floor-1 resident', () => {
    const resident: Person = { ...person('3B'), id: 'x', unit: '1A', pos: unitCenter('1A') }
    const route = routeFor(resident, world)
    expect(route.via).toBe('A')
    expect(route.points.every((p) => p.floor === 1)).toBe(true)
  })
})

describe('entry routes', () => {
  it('starts at staging and ends at the person', () => {
    const route = entryRouteFor(person('2D'), world)
    expect(route.kind).toBe('entry')
    expect(route.points[0]).toEqual(STAGING)
    expect(route.points.at(-1)).toEqual(person('2D').pos)
    near(route.distanceM, 21.75)
  })

  it('crosses the floor 1 hallway to reach Stair A', () => {
    const route = entryRouteFor(person('2B'), world)
    expect(route.via).toBe('A')
    expect(route.points.slice(0, 4)).toEqual([
      STAGING,
      { floor: 1, x: 990, y: 150 },
      { floor: 1, x: 880, y: 150 },
      { floor: 1, x: 120, y: 150 },
    ])
  })

  it('returns rescue routes only for critical people', () => {
    expect(getRescueRoutes(world).map((r) => r.personId).sort()).toEqual(['2B', '2D'])
  })
})

describe('sameFloorLegM', () => {
  it('measures until the route changes floor', () => {
    near(sameFloorLegM(routeFor(person('2D'), world)), 10.75)
    expect(sameFloorLegM(routeFor(person('1C'), world))).toBe(0)
  })
})
