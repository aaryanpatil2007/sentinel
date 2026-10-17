import { describe, expect, it } from 'vitest'
import { floorY, toScene } from './coords'

describe('toScene', () => {
  it('centers the building and maps north to -z', () => {
    const p = toScene(20, 10, 'F1')
    expect([p.x, p.y, p.z]).toEqual([0, 0, -0])
    const north = toScene(20, 20, 'F1')
    expect(north.z).toBe(-10)
  })

  it('stacks floors with exaggerated spacing', () => {
    expect(floorY('B')).toBe(-7)
    expect(floorY('F3')).toBe(14)
    expect(toScene(0, 0, 'F2', 0.5).y).toBe(7.5)
  })
})
