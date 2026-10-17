import { describe, expect, it } from 'vitest'
import type { Person } from '../types'
import { createMockState } from '../data/mock'
import { unitCenter } from './geometry'
import { fillCells } from './grid'
import { fireFloors, instructionMode, instructionsFor, turnDirection } from './guidance'
import { routeFor } from './routing'

const world = createMockState(0).world
const person = (id: string): Person => world.people.find((p) => p.id === id) as Person
const texts = (p: Person, w = world) => instructionsFor(p, routeFor(p, w), w).map((i) => i.text)

describe('instructionsFor', () => {
  it('gives 3B the go instructions from the spec', () => {
    expect(texts(person('3B'))).toEqual([
      'Fire on floor 2.',
      'Your hallway is clear.',
      'Turn RIGHT, take STAIR B down.',
      'Do not use the elevator.',
    ])
  })

  it('warns about smoke and turns left toward Stair A for 2B', () => {
    expect(texts(person('2B'))).toEqual([
      'Fire on floor 2.',
      'Smoke in your hallway. Stay low.',
      'Turn LEFT, take STAIR A down.',
      'Do not use the elevator.',
    ])
  })

  it('tells a floor-1 resident to go straight to the exit', () => {
    const resident: Person = { ...person('3B'), id: 'x', unit: '1A', pos: unitCenter('1A') }
    expect(texts(resident)[2]).toBe('Turn LEFT, go to EXIT A.')
  })

  it('switches to stay instructions when the route is blocked', () => {
    const p = person('3B')
    const lines = instructionsFor(p, { ...routeFor(p, world), blocked: true }, world)
    expect(lines.map((l) => l.text)).toEqual([
      'Both stairs are blocked.',
      'Close your door. Seal gaps with towels.',
      'Go to a window and signal.',
      'Responders know you are in 3B.',
    ])
    expect(lines.length).toBeLessThanOrEqual(4)
  })

  it('never tells an evacuated resident to shelter, even with a forced stay', () => {
    const p = person('1C')
    const forced = { ...routeFor(p, world), blocked: true }
    expect(instructionsFor(p, forced, world)[0].text).toBe('You are out of the building.')
    expect(instructionMode(p, forced)).toBe('out')
  })

  it('lists every floor with fire', () => {
    const hazards = fillCells(world.hazards, 3, [22, 22], [0, 0], 2)
    expect(fireFloors({ ...world, hazards })).toEqual([2, 3])
    expect(texts(person('4A'), { ...world, hazards })[0]).toBe('Fire on floor 2 and 3.')
  })
})

describe('instructionMode and turnDirection', () => {
  it('maps routes to modes', () => {
    const p = person('3B')
    const route = routeFor(p, world)
    expect(instructionMode(p, route)).toBe('go')
    expect(instructionMode(p, { ...route, blocked: true })).toBe('stay')
    expect(turnDirection(p, route)).toBe('RIGHT')
    expect(turnDirection(person('1C'), routeFor(person('1C'), world))).toBeNull()
  })
})
