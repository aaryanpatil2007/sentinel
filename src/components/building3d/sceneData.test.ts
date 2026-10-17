import { describe, expect, it } from 'vitest'
import { civiliansOf, indexNodes, respondersOf } from '../../engine/derive'
import { ENGINE_FIXTURE } from '../../engine/fixture'
import { buildHazards, buildMarkers, buildPaths, shortLabel } from './sceneData'

const nodes = indexNodes(ENGINE_FIXTURE.graph)
const civilians = civiliansOf(ENGINE_FIXTURE.state)
const responders = respondersOf(ENGINE_FIXTURE.state)

describe('shortLabel', () => {
  it('uses room numbers, else initials', () => {
    expect(shortLabel('Studio 210')).toBe('210')
    expect(shortLabel('Advanced Prototyping Lab')).toBe('APL')
    expect(shortLabel('Metal Shop')).toBe('MS')
  })
})

describe('buildMarkers', () => {
  const markers = buildMarkers(civilians, responders, nodes, { selectedId: 'CIV_002', hoveredId: null })

  it('places every located entity once', () => {
    expect(markers).toHaveLength(civilians.length + responders.length)
    expect(markers.find((m) => m.id === 'CIV_001')).toMatchObject({ kind: 'civilian', floor: 'F2', label: '210 · 2', tone: 'critical' })
    expect(markers.find((m) => m.id === 'CIV_002')?.selected).toBe(true)
  })

  it('spreads entities that share a node', () => {
    const atStaging = markers.filter((m) => m.kind === 'responder')
    expect(atStaging).toHaveLength(2)
    expect(atStaging[0].x === atStaging[1].x && atStaging[0].y === atStaging[1].y).toBe(false)
    expect(atStaging.map((m) => m.label)).toEqual(['Alpha', 'Bravo'])
  })
})

describe('buildHazards', () => {
  it('positions node hazards at their node', () => {
    const hazards = buildHazards(ENGINE_FIXTURE.state.hazards, nodes, ENGINE_FIXTURE.graph.edges)
    expect(hazards.find((h) => h.type === 'fire')).toMatchObject({ floor: 'F2', x: 28, y: 10 })
  })

  it('positions edge hazards at the edge midpoint', () => {
    const edge = ENGINE_FIXTURE.graph.edges[0]
    const [h] = buildHazards([{ ...ENGINE_FIXTURE.state.hazards[0], hazard_id: 'E', node_id: null, edge_id: edge.edge_id }], nodes, ENGINE_FIXTURE.graph.edges)
    const a = nodes.get(edge.from_node)!
    const b = nodes.get(edge.to_node)!
    expect(h).toMatchObject({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, floor: a.floor_id })
  })
})

describe('buildPaths', () => {
  it('draws assigned rescue routes and the focused evacuation route', () => {
    const evac = ENGINE_FIXTURE.evacuations.CIV_003
    const paths = buildPaths(ENGINE_FIXTURE.state.routes, evac, 'CIV_003')
    expect(paths.filter((p) => p.variant === 'rescue')).toHaveLength(2)
    expect(paths.find((p) => p.variant === 'evacuation')?.id).toBe('EVAC_CIV_003')
  })

  it('emphasizes the rescue route to the focused civilian and dims the rest', () => {
    const target = ENGINE_FIXTURE.state.routes[0].meta?.civilian_id ?? ''
    const paths = buildPaths(ENGINE_FIXTURE.state.routes, null, target)
    expect(paths.find((p) => p.id === ENGINE_FIXTURE.state.routes[0].route_id)?.emphasized).toBe(true)
    expect(paths.filter((p) => p.dimmed)).toHaveLength(1)
  })
})
