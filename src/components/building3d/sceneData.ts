import { civilianTone, peopleCount, placeLabel, type NodeIndex } from '../../engine/derive'
import type { Entity, GraphEdge, Hazard, Route } from '../../engine/types'
import { RESPONDER_LABEL } from '../../lib/labels'
import type { SceneHazard, SceneMarker, ScenePath } from './types'

const SPREAD_M = 1.1
const SPREAD_ANGLE = 2.4

export function shortLabel(label: string): string {
  const number = label.match(/\b\d{2,3}\b/)
  if (number) return number[0]
  return label
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

export function buildMarkers(
  civilians: Entity[],
  responders: Entity[],
  nodes: NodeIndex,
  { selectedId, hoveredId }: { selectedId: string | null; hoveredId: string | null },
): SceneMarker[] {
  const perNode = new Map<string, number>()
  const place = (e: Entity, kind: SceneMarker['kind'], label: string, tone: SceneMarker['tone']): SceneMarker[] => {
    const node = e.graph_node_id ? nodes.get(e.graph_node_id) : undefined
    if (!node) return []
    const index = perNode.get(node.node_id) ?? 0
    perNode.set(node.node_id, index + 1)
    const radius = index === 0 ? 0 : SPREAD_M
    return [{
      id: e.entity_id,
      kind,
      floor: node.floor_id,
      x: node.x + Math.cos(index * SPREAD_ANGLE) * radius,
      y: node.y + Math.sin(index * SPREAD_ANGLE) * radius,
      label,
      tone,
      selected: e.entity_id === selectedId,
      emphasized: e.entity_id === hoveredId,
    }]
  }
  return [
    ...civilians.flatMap((c) => place(c, 'civilian', `${shortLabel(placeLabel(c, nodes))} · ${peopleCount(c)}`, civilianTone(c, nodes))),
    ...responders.flatMap((r) => place(r, 'responder', RESPONDER_LABEL[r.entity_id] ?? r.name ?? r.entity_id, 'safe')),
  ]
}

export function buildHazards(hazards: Hazard[], nodes: NodeIndex, edges: GraphEdge[]): SceneHazard[] {
  return hazards.flatMap((h): SceneHazard[] => {
    const node = h.node_id ? nodes.get(h.node_id) : undefined
    if (node) return [{ id: h.hazard_id, type: h.hazard_type, floor: node.floor_id, x: node.x, y: node.y }]
    const edge = h.edge_id ? edges.find((e) => e.edge_id === h.edge_id) : undefined
    const a = edge ? nodes.get(edge.from_node) : undefined
    const b = edge ? nodes.get(edge.to_node) : undefined
    if (!a || !b) return []
    return [{ id: h.hazard_id, type: h.hazard_type, floor: a.floor_id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]
  })
}

export function buildPaths(routes: Route[], evacuation: Route | null | undefined, focusCivilianId: string | null): ScenePath[] {
  const rescue: ScenePath[] = routes
    .filter((r) => r.meta?.responder_id && r.status === 'candidate' && r.polyline.length > 1)
    .map((r) => ({
      id: r.route_id,
      points: r.polyline,
      variant: 'rescue',
      emphasized: focusCivilianId !== null && r.meta?.civilian_id === focusCivilianId,
      dimmed: focusCivilianId !== null && r.meta?.civilian_id !== focusCivilianId,
    }))
  const evac: ScenePath[] =
    evacuation && evacuation.status === 'candidate' && evacuation.polyline.length > 1
      ? [{ id: evacuation.route_id, points: evacuation.polyline, variant: 'evacuation', emphasized: true }]
      : []
  return [...rescue, ...evac]
}
