import { describe, expect, it } from 'vitest'
import { createMockState } from '../data/mock'
import { rank } from './priority'
import { getRescueRoutes } from './routing'

const world = createMockState(0).world

describe('rank', () => {
  const ranked = rank(world, getRescueRoutes(world))

  it('puts critical people first, nearest first', () => {
    expect(ranked.slice(0, 2).map((r) => r.personId)).toEqual(['2D', '2B'])
    expect(Math.abs(ranked[0].distanceM - 21.75)).toBeLessThan(0.11)
  })

  it('puts evacuated people last', () => {
    expect(ranked.slice(-2).map((r) => r.personId).sort()).toEqual(['1C', '4E'])
  })

  it('numbers ranks from 1 without gaps', () => {
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })
})
