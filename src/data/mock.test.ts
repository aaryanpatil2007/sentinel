import { describe, expect, it } from 'vitest'
import { isInsideBuilding } from '../lib/geometry'
import { CREW_THREAD_ID, DEFAULT_RESIDENT_ID, createMockState, threadIdFor } from './mock'

const NOW = new Date(2026, 9, 17, 14, 30, 0).getTime()
const state = createMockState(NOW)
const byUnit = Object.fromEntries(state.world.people.map((p) => [p.unit, p]))

describe('mock incident', () => {
  it('has 8 units with unique ids', () => {
    expect(state.world.people).toHaveLength(8)
    expect(new Set(state.world.people.map((p) => p.id)).size).toBe(8)
  })

  it('matches the status table', () => {
    expect(byUnit['2D']).toMatchObject({ count: 3, status: 'trapped', priority: 'critical' })
    expect(byUnit['2B']).toMatchObject({ count: 1, status: 'immobile', priority: 'critical' })
    expect(byUnit['3B']).toMatchObject({ count: 2, status: 'sheltering', priority: 'moderate' })
    expect(byUnit['3F']).toMatchObject({ status: 'unknown', priority: 'moderate' })
    expect(byUnit['2G']).toMatchObject({ status: 'evacuating', priority: 'moderate' })
    expect(byUnit['4A']).toMatchObject({ count: 4, status: 'sheltering' })
    expect(byUnit['1C']).toMatchObject({ status: 'evacuated', priority: 'safe' })
    expect(byUnit['4E']).toMatchObject({ status: 'evacuated', priority: 'safe' })
  })

  it('keeps everyone who is not evacuated inside the building', () => {
    for (const p of state.world.people) {
      if (p.status !== 'evacuated') expect(isInsideBuilding(p.pos)).toBe(true)
    }
  })

  it('puts fire only on floor 2', () => {
    expect(state.world.hazards[2]).toContain(2)
    for (const f of [1, 3, 4] as const) expect(state.world.hazards[f]).not.toContain(2)
    expect(state.world.hazards[3]).toContain(1)
  })

  it('has a crew thread and one thread per resident', () => {
    expect(state.threads.find((t) => t.id === CREW_THREAD_ID)?.kind).toBe('crew')
    for (const p of state.world.people) {
      expect(state.threads.find((t) => t.id === threadIdFor(p.id))?.personId).toBe(p.id)
    }
  })

  it('gives each resident thread 6 to 10 messages and crew about 10', () => {
    for (const t of state.threads) {
      const n = t.messages.length
      if (t.kind === 'resident') expect(n >= 6 && n <= 10).toBe(true)
      else expect(n).toBe(10)
    }
  })

  it('timestamps every message between incident start and now', () => {
    for (const m of state.threads.flatMap((t) => t.messages)) {
      expect(m.at).toBeGreaterThanOrEqual(state.incident.startedAt)
      expect(m.at).toBeLessThanOrEqual(NOW)
    }
  })

  it('includes the default resident', () => {
    expect(byUnit[DEFAULT_RESIDENT_ID]).toBeDefined()
  })
})
