/** Pure derivations from engine payloads to what the UI shows. */
import type { Instruction, InstructionMode, Priority } from '../types'
import {
  FLOOR_ELEVATION,
  FLOOR_NAME,
  type BuildingGraph,
  type Entity,
  type FloorId,
  type GraphNode,
  type Hazard,
  type IncidentSnapshot,
  type Route,
  type WorldPosition,
} from './types'

export type CivilianStatus = 'trapped' | 'immobile' | 'sheltering' | 'evacuated' | 'unknown'
export type NodeIndex = ReadonlyMap<string, GraphNode>

export const CIVILIAN_STATUS_LABEL: Record<CivilianStatus, string> = {
  trapped: 'Trapped',
  immobile: "Can't move",
  sheltering: 'Sheltering',
  evacuated: 'Evacuated',
  unknown: 'No location',
}

const FLOOR_ORDER: FloorId[] = ['B', 'F1', 'F2', 'F3']
const BUILDING_CENTER_X = 20

export function indexNodes(graph: BuildingGraph | null): NodeIndex {
  return new Map((graph?.nodes ?? []).map((n) => [n.node_id, n]))
}

export function civiliansOf(snapshot: IncidentSnapshot | null): Entity[] {
  return (snapshot?.entities ?? []).filter((e) => e.entity_type === 'civilian')
}

export function respondersOf(snapshot: IncidentSnapshot | null): Entity[] {
  return (snapshot?.entities ?? []).filter((e) => e.entity_type === 'responder')
}

function nodeOf(c: Entity, nodes: NodeIndex): GraphNode | undefined {
  return c.graph_node_id ? nodes.get(c.graph_node_id) : undefined
}

export function civilianStatus(c: Entity, nodes: NodeIndex): CivilianStatus {
  const node = nodeOf(c, nodes)
  if (!node) return 'unknown'
  if (node.node_type === 'staging' || node.node_type === 'entrance') return 'evacuated'
  if (c.report?.mobility_limited || c.report?.unconscious) return 'immobile'
  if (c.report?.exits_blocked) return 'trapped'
  return 'sheltering'
}

export function civilianTone(c: Entity, nodes: NodeIndex): Priority {
  if (civilianStatus(c, nodes) === 'evacuated') return 'safe'
  return c.priority?.priority === 'urgent_review' ? 'critical' : 'moderate'
}

export function peopleCount(c: Entity): number {
  return c.report?.people_count ?? 1
}

export function placeLabel(c: Entity, nodes: NodeIndex): string {
  return nodeOf(c, nodes)?.label ?? 'Location unknown'
}

export function floorOf(c: Entity, nodes: NodeIndex): FloorId | null {
  return nodeOf(c, nodes)?.floor_id ?? null
}

export function fireFloors(hazards: Hazard[], nodes: NodeIndex): FloorId[] {
  const burning = new Set(
    hazards.filter((h) => h.hazard_type === 'fire' && h.node_id).map((h) => nodes.get(h.node_id as string)?.floor_id),
  )
  return FLOOR_ORDER.filter((f) => burning.has(f))
}

function joinFloors(floors: FloorId[]): string {
  const names = floors.map((f) => FLOOR_NAME[f])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function firstStair(route: Route, nodes: NodeIndex): { side: 'WEST' | 'EAST'; direction: 'up' | 'down' } | null {
  const index = route.nodes.findIndex((id) => nodes.get(id)?.node_type === 'stairs')
  if (index < 0) return null
  const stair = nodes.get(route.nodes[index]) as GraphNode
  const nextFloor = route.nodes
    .slice(index + 1)
    .map((id) => nodes.get(id))
    .find((n) => n && n.floor_id !== stair.floor_id)
  const direction = nextFloor && FLOOR_ELEVATION[nextFloor.floor_id] > FLOOR_ELEVATION[stair.floor_id] ? 'up' : 'down'
  return { side: stair.x < BUILDING_CENTER_X ? 'WEST' : 'EAST', direction }
}

export function exitLabel(route: Route, nodes: NodeIndex): string {
  return nodes.get(route.destination_node)?.label ?? 'the exit'
}

export function instructionMode(c: Entity, evac: Route | null | undefined, nodes: NodeIndex): InstructionMode {
  if (civilianStatus(c, nodes) === 'evacuated') return 'out'
  return evac?.status === 'candidate' ? 'go' : 'stay'
}

export function instructionsFor(c: Entity, evac: Route | null | undefined, hazards: Hazard[], nodes: NodeIndex): Instruction[] {
  const mode = instructionMode(c, evac, nodes)
  if (mode === 'out') {
    return [
      { text: 'You are out of the building.', tone: 'go' },
      { text: 'Stay at the staging area.', tone: 'info' },
      { text: 'Tell a responder if anyone is missing.', tone: 'info' },
    ]
  }
  if (mode === 'stay' || !evac) {
    return [
      { text: 'Your exits are blocked.', tone: 'stay' },
      { text: 'Close your door. Seal gaps with towels.', tone: 'stay' },
      { text: 'Go to a window and signal.', tone: 'stay' },
      { text: `Responders know you are in ${placeLabel(c, nodes)}.`, tone: 'info' },
    ]
  }
  const fires = fireFloors(hazards, nodes)
  const smokeOnRoute = hazards.some((h) => h.hazard_type === 'smoke' && h.node_id !== null && evac.nodes.includes(h.node_id))
  const stair = firstStair(evac, nodes)
  return [
    { text: fires.length ? `Fire reported on ${joinFloors(fires)}.` : 'No fire reported near you.', tone: 'info' },
    { text: smokeOnRoute ? 'Smoke on your route. Stay low.' : 'Your route is clear.', tone: smokeOnRoute ? 'info' : 'go' },
    { text: stair ? `Take the ${stair.side} STAIR ${stair.direction}.` : `Go to the ${exitLabel(evac, nodes).toUpperCase()}.`, tone: 'go' },
    { text: 'Do not use the elevator.', tone: 'info' },
  ]
}

/** `prev === undefined` means this civilian has not been observed yet: never announce a change. */
export function describeEvacuationChange(prev: Route | null | undefined, next: Route | null | undefined, nodes: NodeIndex): string | null {
  if (prev === undefined) return null
  const wasOpen = prev?.status === 'candidate'
  const isOpen = next?.status === 'candidate'
  if (wasOpen && !isOpen) return 'Route blocked · Shelter in place'
  if (!wasOpen && isOpen && next) return `Route open · Exit via ${exitLabel(next, nodes)}`
  if (wasOpen && isOpen && prev && next && prev.destination_node !== next.destination_node) {
    return `Route updated · ${exitLabel(prev, nodes)} → ${exitLabel(next, nodes)}`
  }
  return null
}

export function statusChangeText(prev: CivilianStatus | undefined, next: CivilianStatus): string | null {
  if (prev === undefined || prev === next) return null
  return `Status changed to ${CIVILIAN_STATUS_LABEL[next]}`
}

export function rescueRoutesFor(routes: Route[], civilianId: string): Route[] {
  return routes.filter((r) => r.meta?.civilian_id === civilianId && r.status === 'candidate')
}

export function assignedResponder(routes: Route[], civilianId: string): string | null {
  return routes.find((r) => r.meta?.civilian_id === civilianId && r.meta.responder_id)?.meta?.responder_id ?? null
}

export function nodePosition(node: GraphNode): WorldPosition {
  return { x: node.x, y: node.y, z: node.z, floor_id: node.floor_id, coordinate_frame: 'JACOBS_LOCAL' }
}
