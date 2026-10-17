import { describe, expect, it } from 'vitest'
import type { Person } from '../types'
import { createMockState } from '../data/mock'
import { isAtStaging } from '../lib/geometry'
import { applyQuickReply } from './quickReply'

const world = createMockState(0).world
const p3b = world.people.find((p) => p.id === '3B') as Person

describe('applyQuickReply', () => {
  it('marks trapped residents critical', () => {
    expect(applyQuickReply(p3b, 'trapped', world, 5)).toMatchObject({ status: 'trapped', priority: 'critical', lastUpdate: 5 })
  })

  it('adds the Immobile flag once', () => {
    const once = applyQuickReply(p3b, 'cant-move', world, 5)
    const twice = applyQuickReply(once, 'cant-move', world, 6)
    expect(twice).toMatchObject({ status: 'immobile', priority: 'critical' })
    expect(twice.mobility.filter((m) => m === 'Immobile')).toHaveLength(1)
  })

  it('moves residents who are out to staging, and keeps them there on repeat', () => {
    const out = applyQuickReply(p3b, 'out', world, 5)
    expect(out).toMatchObject({ status: 'evacuated', priority: 'safe' })
    expect(isAtStaging(out.pos)).toBe(true)
    expect(applyQuickReply(out, 'out', world, 6).pos).toEqual(out.pos)
  })

  it('does not mutate the input person', () => {
    applyQuickReply(p3b, 'trapped', world, 5)
    expect(p3b.status).toBe('sheltering')
  })
})
