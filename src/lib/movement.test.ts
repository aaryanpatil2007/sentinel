import { describe, expect, it } from 'vitest'
import type { Point, World } from '../types'
import { createMockState } from '../data/mock'
import { isAtStaging } from './geometry'
import { advanceAlong, stepPeople } from './movement'

const line: Point[] = [
  { floor: 2, x: 0, y: 150 },
  { floor: 2, x: 200, y: 150 },
]

describe('advanceAlong', () => {
  it('interpolates within a segment', () => {
    expect(advanceAlong(line, 5)).toEqual({ pos: { floor: 2, x: 100, y: 150 }, done: false })
  })
  it('reports done past the end', () => {
    expect(advanceAlong(line, 50)).toEqual({ pos: line[1], done: true })
  })
  it('snaps across a floor change', () => {
    const stairs: Point[] = [{ floor: 2, x: 920, y: 150 }, { floor: 1, x: 920, y: 150 }, { floor: 1, x: 990, y: 150 }]
    expect(advanceAlong(stairs, 3).pos.floor).toBe(1)
  })
})

describe('stepPeople', () => {
  const world = createMockState(0).world

  it('moves evacuating people and leaves others untouched', () => {
    const next = stepPeople(world, 1)
    const before = world.people.find((p) => p.id === '2G')
    const after = next.find((p) => p.id === '2G')
    expect(after?.pos).not.toEqual(before?.pos)
    expect(next.find((p) => p.id === '3B')).toBe(world.people.find((p) => p.id === '3B'))
  })

  it('evacuates 2G to staging within a few steps', () => {
    let current: World = world
    for (let i = 0; i < 10; i++) current = { ...current, people: stepPeople(current, i) }
    const g = current.people.find((p) => p.id === '2G')
    expect(g).toMatchObject({ status: 'evacuated', priority: 'safe' })
    expect(g && isAtStaging(g.pos)).toBe(true)
  })
})
