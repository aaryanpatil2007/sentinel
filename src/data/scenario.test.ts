import { describe, expect, it } from 'vitest'
import { ENGINE_FIXTURE } from '../engine/fixture'
import scenario from './scenario.json'
import { CAMERAS, CREW_THREAD_ID, DEFAULT_RESIDENT_ID, seedThreads, threadIdFor } from './scenarioThreads'

const NOW = new Date(2026, 9, 17, 14, 30, 0).getTime()
const civilians = ENGINE_FIXTURE.state.entities.filter((e) => e.entity_type === 'civilian')
const nodeIds = new Set(ENGINE_FIXTURE.graph.nodes.map((n) => n.node_id))

describe('scenario and recorded snapshot', () => {
  it('records one civilian per scenario resident, in order', () => {
    expect(civilians.map((c) => c.entity_id)).toEqual(scenario.residents.map((_, i) => `CIV_00${i + 1}`))
    expect(civilians.map((c) => c.report?.raw_text)).toEqual(scenario.residents.map((r) => r.text))
  })

  it('places every scenario civilian in a room', () => {
    expect(civilians.map((c) => c.graph_node_id)).toEqual([
      'F2_STUDIO_210', 'B_METAL_SHOP', 'F3_STUDIO_310', 'F3_PROTOTYPING_LAB', 'F1_STUDIO_110', 'F1_STUDIO_120',
    ])
  })

  it('assigns both responders a rescue route', () => {
    expect(ENGINE_FIXTURE.state.routes.map((r) => r.route_id).sort()).toEqual(['RESCUE_UNIT_ALPHA', 'RESCUE_UNIT_BRAVO'])
  })

  it('records an evacuation route for every civilian', () => {
    for (const c of civilians) expect(ENGINE_FIXTURE.evacuations[c.entity_id]?.route_id).toBe(`EVAC_${c.entity_id}`)
  })

  it('defaults the resident view to a recorded civilian', () => {
    expect(DEFAULT_RESIDENT_ID).toBe(scenario.defaultResidentId)
    expect(civilians.some((c) => c.entity_id === DEFAULT_RESIDENT_ID)).toBe(true)
  })

  it('pins cameras to real graph nodes', () => {
    for (const cam of CAMERAS) expect(nodeIds.has(cam.nodeId)).toBe(true)
    expect(CAMERAS.filter((c) => c.status === 'no-signal')).toHaveLength(1)
  })
})

describe('seedThreads', () => {
  const threads = seedThreads(NOW)

  it('creates the crew channel and one thread per scenario civilian', () => {
    expect(threads[0].id).toBe(CREW_THREAD_ID)
    expect(threads.slice(1).map((t) => t.personId)).toEqual(civilians.map((c) => c.entity_id))
    for (const c of civilians) expect(threads.find((t) => t.id === threadIdFor(c.entity_id))).toBeDefined()
  })

  it('opens each resident thread with that resident’s report', () => {
    for (const [i, t] of threads.slice(1).entries()) {
      expect(t.messages[0]).toMatchObject({ from: 'resident', text: scenario.residents[i].text })
      expect(t.messages.length).toBeGreaterThanOrEqual(6)
      expect(t.messages.length).toBeLessThanOrEqual(10)
    }
  })

  it('timestamps messages in order and never in the future', () => {
    for (const t of threads) {
      const times = t.messages.map((m) => m.at)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(Math.max(...times)).toBeLessThanOrEqual(NOW)
    }
  })
})
