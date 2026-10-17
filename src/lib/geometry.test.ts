import { describe, expect, it } from 'vitest'
import { doorFor, isAtStaging, isInsideBuilding, stagingSpot, unitAt, unitCenter } from './geometry'

describe('unitCenter', () => {
  it('places top-row units above the hallway', () => {
    expect(unitCenter('2D')).toEqual({ floor: 2, x: 785, y: 70 })
  })
  it('places bottom-row units below the hallway', () => {
    expect(unitCenter('3F')).toEqual({ floor: 3, x: 405, y: 230 })
  })
  it('rejects unknown units', () => {
    expect(() => unitCenter('5A')).toThrow('Unknown unit')
    expect(() => unitCenter('2Z')).toThrow('Unknown unit')
  })
})

describe('unitAt', () => {
  it('round-trips unit centers', () => {
    for (const unit of ['1A', '2D', '3E', '4H']) expect(unitAt(unitCenter(unit))).toBe(unit)
  })
  it('returns null in the hallway', () => {
    expect(unitAt({ floor: 2, x: 500, y: 150 })).toBeNull()
  })
})

describe('doorFor', () => {
  it('uses the hallway edge below a top unit', () => {
    expect(doorFor(unitCenter('2D'))).toEqual({ x: 785, y: 120 })
  })
  it('uses the hallway edge above a bottom unit', () => {
    expect(doorFor(unitCenter('3F'))).toEqual({ x: 405, y: 180 })
  })
  it('keeps hallway positions and clamps stairwell positions', () => {
    expect(doorFor({ floor: 2, x: 760, y: 150 })).toEqual({ x: 760, y: 150 })
    expect(doorFor({ floor: 2, x: 920, y: 150 })).toEqual({ x: 880, y: 150 })
  })
})

describe('building bounds and staging', () => {
  it('distinguishes inside, outside and staging', () => {
    expect(isInsideBuilding({ floor: 1, x: 500, y: 150 })).toBe(true)
    expect(isInsideBuilding({ floor: 1, x: 1060, y: 150 })).toBe(false)
    expect(stagingSpot(0)).toEqual({ floor: 1, x: 1060, y: 86 })
    expect(isAtStaging(stagingSpot(3))).toBe(true)
    expect(isAtStaging(unitCenter('1A'))).toBe(false)
  })
})
