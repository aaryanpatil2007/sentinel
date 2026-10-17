import { describe, expect, it } from 'vitest'
import { createMockState } from '../data/mock'
import { getCameraFeeds } from './camera'
import { emptyGrid } from './grid'
import { applyDetection, detect } from './perception'

const world = createMockState(0).world

describe('camera and perception stubs', () => {
  it('returns the four placeholder cameras with Hall 3 offline', () => {
    const feeds = getCameraFeeds()
    expect(feeds.map((f) => f.label)).toEqual(['Hall 2', 'Stair A', 'Lobby', 'Hall 3'])
    expect(feeds.find((f) => f.label === 'Hall 3')?.status).toBe('no-signal')
  })

  it('detect returns nothing and applyDetection keeps the world', () => {
    const detection = detect(getCameraFeeds(), world)
    expect(detection).toEqual({})
    expect(applyDetection(world, detection)).toEqual(world)
  })

  it('applyDetection replaces only what was detected', () => {
    const hazards = emptyGrid()
    const next = applyDetection(world, { hazards })
    expect(next.hazards).toBe(hazards)
    expect(next.people).toBe(world.people)
  })
})
