import { describe, expect, it } from 'vitest'
import { ENGINE_FIXTURE } from './fixture'
import {
  assignedResponder,
  civilianStatus,
  civilianTone,
  civiliansOf,
  describeEvacuationChange,
  fireFloors,
  indexNodes,
  instructionMode,
  instructionsFor,
  placeLabel,
  statusChangeText,
} from './derive'
import type { CivilianReport, Entity, Hazard, ReviewPriority, Route } from './types'

const nodes = indexNodes(ENGINE_FIXTURE.graph)

const report = (overrides: Partial<CivilianReport> = {}): CivilianReport => ({
  raw_text: 'test', location: null, people_count: 1, mobility_limited: false, unconscious: false,
  smoke_reported: false, fire_reported: false, exits_blocked: false, unknowns: [], ...overrides,
})

const civilian = (node: string | null, rep: Partial<CivilianReport> = {}, priority: ReviewPriority = 'standard_review'): Entity => ({
  entity_id: 'CIV_X', entity_type: 'civilian', name: null, world_position: null, graph_node_id: node,
  source: 'civilian_report', position_status: 'reported', last_updated: 't', report: report(rep),
  priority: { priority, score: 0, reported_conditions: [], reason: '', requires_responder_review: true, flags: [] }, flags: [],
})

const route = (path: string[], status: Route['status'] = 'candidate'): Route => ({
  route_id: 'EVAC_CIV_X', status, start_node: path[0], destination_node: path[path.length - 1], nodes: path, edge_ids: [],
  polyline: [], steps: [], total_distance_m: 0, total_cost: 0, hazards_considered: [], assumptions: [],
  requires_command_approval: true, unreachable_reason: null,
})

const hazard = (hazard_type: Hazard['hazard_type'], node_id: string): Hazard => ({
  hazard_id: `H_${node_id}`, hazard_type, node_id, edge_id: null, verified: true, source: 'test', description: '', created_at: 't',
})

const FROM_310 = ['F3_STUDIO_310', 'F3_CORRIDOR_WEST', 'F3_STAIR_A', 'F2_STAIR_A', 'F1_STAIR_A', 'F1_CORRIDOR_WEST', 'F1_CORRIDOR_CENTER', 'F1_ENTRANCE_MAIN']
const SCENARIO_HAZARDS = [hazard('fire', 'F2_CORRIDOR_EAST'), hazard('smoke', 'F3_CORRIDOR_CENTER')]

describe('civilian status and tone', () => {
  it('derives status from location and report', () => {
    expect(civilianStatus(civilian('EXT_STAGING', { exits_blocked: true }), nodes)).toBe('evacuated')
    expect(civilianStatus(civilian('F1_ENTRANCE_EAST'), nodes)).toBe('evacuated')
    expect(civilianStatus(civilian('F2_STUDIO_210', { mobility_limited: true, exits_blocked: true }), nodes)).toBe('immobile')
    expect(civilianStatus(civilian('B_METAL_SHOP', { exits_blocked: true }), nodes)).toBe('trapped')
    expect(civilianStatus(civilian('F3_STUDIO_310'), nodes)).toBe('sheltering')
    expect(civilianStatus(civilian(null), nodes)).toBe('unknown')
  })

  it('maps priority to tone, with evacuated always safe', () => {
    expect(civilianTone(civilian('F2_STUDIO_210', {}, 'urgent_review'), nodes)).toBe('critical')
    expect(civilianTone(civilian('F2_STUDIO_210', {}, 'priority_review'), nodes)).toBe('moderate')
    expect(civilianTone(civilian('F2_STUDIO_210', {}, 'standard_review'), nodes)).toBe('moderate')
    expect(civilianTone(civilian('EXT_STAGING', {}, 'urgent_review'), nodes)).toBe('safe')
  })

  it('labels the place from the graph', () => {
    expect(placeLabel(civilian('F3_PROTOTYPING_LAB'), nodes)).toBe('Advanced Prototyping Lab')
    expect(placeLabel(civilian(null), nodes)).toBe('Location unknown')
  })
})

describe('instructionsFor', () => {
  it('gives go instructions down the west stair from Studio 310', () => {
    const c = civilian('F3_STUDIO_310')
    expect(instructionsFor(c, route(FROM_310), SCENARIO_HAZARDS, nodes).map((i) => i.text)).toEqual([
      'Fire reported on Floor 2.',
      'Your route is clear.',
      'Take the WEST STAIR down.',
      'Do not use the elevator.',
    ])
  })

  it('warns about smoke on the route', () => {
    const lines = instructionsFor(civilian('F3_STUDIO_310'), route(FROM_310), [hazard('smoke', 'F3_CORRIDOR_WEST')], nodes)
    expect(lines[1].text).toBe('Smoke on your route. Stay low.')
    expect(lines[0].text).toBe('No fire reported near you.')
  })

  it('sends basement occupants up the east stair', () => {
    const path = ['B_METAL_SHOP', 'B_CORRIDOR_EAST', 'B_STAIR_B', 'F1_STAIR_B', 'F1_CORRIDOR_EAST', 'F1_ENTRANCE_EAST']
    expect(instructionsFor(civilian('B_METAL_SHOP'), route(path), [], nodes)[2].text).toBe('Take the EAST STAIR up.')
  })

  it('sends floor 1 occupants straight to the exit', () => {
    const path = ['F1_STUDIO_120', 'F1_CORRIDOR_EAST', 'F1_ENTRANCE_EAST']
    expect(instructionsFor(civilian('F1_STUDIO_120'), route(path), [], nodes)[2].text).toBe('Go to the EAST ENTRANCE.')
  })

  it('switches to shelter-in-place when no route exists', () => {
    const c = civilian('F3_STUDIO_310')
    const lines = instructionsFor(c, route(FROM_310, 'unreachable'), [], nodes)
    expect(instructionMode(c, route(FROM_310, 'unreachable'), nodes)).toBe('stay')
    expect(lines.map((l) => l.text)).toEqual([
      'Your exits are blocked.',
      'Close your door. Seal gaps with towels.',
      'Go to a window and signal.',
      'Responders know you are in Studio 310.',
    ])
    expect(instructionsFor(c, null, [], nodes)[0].text).toBe('Your exits are blocked.')
  })

  it('never tells an evacuated civilian to shelter', () => {
    const c = civilian('EXT_STAGING')
    expect(instructionMode(c, route(FROM_310, 'unreachable'), nodes)).toBe('out')
    expect(instructionsFor(c, null, [], nodes)[0].text).toBe('You are out of the building.')
  })

  it('lists every floor with fire', () => {
    expect(fireFloors([hazard('fire', 'F3_CORRIDOR_EAST'), hazard('fire', 'F2_CORRIDOR_EAST'), hazard('smoke', 'B_CORRIDOR_EAST')], nodes)).toEqual(['F2', 'F3'])
    const lines = instructionsFor(civilian('F3_STUDIO_310'), route(FROM_310), [hazard('fire', 'F3_CORRIDOR_EAST'), hazard('fire', 'F2_CORRIDOR_EAST')], nodes)
    expect(lines[0].text).toBe('Fire reported on Floor 2 and Floor 3.')
  })

  it('keeps every recorded civilian within four lines', () => {
    for (const c of civiliansOf(ENGINE_FIXTURE.state)) {
      const lines = instructionsFor(c, ENGINE_FIXTURE.evacuations[c.entity_id], ENGINE_FIXTURE.state.hazards, nodes)
      expect(lines.length).toBeLessThanOrEqual(4)
    }
  })
})

describe('change descriptions', () => {
  const open = route(FROM_310)
  const east = route(['F3_STUDIO_310', 'F3_CORRIDOR_EAST', 'F3_STAIR_B', 'F2_STAIR_B', 'F1_STAIR_B', 'F1_CORRIDOR_EAST', 'F1_ENTRANCE_EAST'])

  it('describes route changes once there is a previous observation', () => {
    expect(describeEvacuationChange(undefined, open, nodes)).toBeNull()
    expect(describeEvacuationChange(open, route(FROM_310, 'unreachable'), nodes)).toBe('Route blocked · Shelter in place')
    expect(describeEvacuationChange(null, open, nodes)).toBe('Route open · Exit via Main Entrance')
    expect(describeEvacuationChange(open, east, nodes)).toBe('Route updated · Main Entrance → East Entrance')
    expect(describeEvacuationChange(open, open, nodes)).toBeNull()
  })

  it('describes status changes only when the status changes', () => {
    expect(statusChangeText(undefined, 'trapped')).toBeNull()
    expect(statusChangeText('trapped', 'trapped')).toBeNull()
    expect(statusChangeText('sheltering', 'trapped')).toBe('Status changed to Trapped')
  })

  it('finds the responder assigned to a civilian', () => {
    const rescue = ENGINE_FIXTURE.state.routes.find((r) => r.route_id === 'RESCUE_UNIT_ALPHA')
    expect(rescue?.meta?.civilian_id).toBeDefined()
    expect(assignedResponder(ENGINE_FIXTURE.state.routes, rescue?.meta?.civilian_id ?? '')).toBe('UNIT_ALPHA')
    expect(assignedResponder(ENGINE_FIXTURE.state.routes, 'CIV_NONE')).toBeNull()
  })
})
