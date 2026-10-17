/** Payload types for sentinel_engine (see sentinel_engine/INTEGRATION.md). */
export type FloorId = 'B' | 'F1' | 'F2' | 'F3'
/** Top to bottom, the order floors are listed and stacked. */
export const FLOOR_IDS: readonly FloorId[] = ['F3', 'F2', 'F1', 'B']
export const FLOOR_ELEVATION: Record<FloorId, number> = { B: -4, F1: 0, F2: 4, F3: 8 }
export const FLOOR_NAME: Record<FloorId, string> = { B: 'Basement', F1: 'Floor 1', F2: 'Floor 2', F3: 'Floor 3' }

export type WorldPosition = { x: number; y: number; z: number; floor_id: FloorId; coordinate_frame: string }

export type NodeType = 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance' | 'staging'
export type GraphNode = { node_id: string; floor_id: FloorId; node_type: NodeType; label: string; x: number; y: number; z: number }
export type GraphEdge = { edge_id: string; from_node: string; to_node: string; distance_m: number; edge_type: string }
export type BuildingGraph = { nodes: GraphNode[]; edges: GraphEdge[] }

export type ReviewPriority = 'urgent_review' | 'priority_review' | 'standard_review'
export type ResolvedLocation = { node_id: string; floor_id: FloorId; match_type: string; matched_text: string; conflict: string | null }
export type CivilianReport = {
  raw_text: string
  location: ResolvedLocation | null
  people_count: number
  mobility_limited: boolean
  unconscious: boolean
  smoke_reported: boolean
  fire_reported: boolean
  exits_blocked: boolean
  unknowns: string[]
}
export type TriagePriority = {
  priority: ReviewPriority
  score: number
  reported_conditions: string[]
  reason: string
  requires_responder_review: boolean
  flags: string[]
}

export type EntityType = 'civilian' | 'responder' | 'detected_person'
export type Entity = {
  entity_id: string
  entity_type: EntityType
  name: string | null
  world_position: WorldPosition | null
  graph_node_id: string | null
  source: string
  position_status: string
  last_updated: string
  report: CivilianReport | null
  priority: TriagePriority | null
  flags: string[]
}

export type HazardType = 'fire' | 'smoke' | 'blocked'
export type Hazard = {
  hazard_id: string
  hazard_type: HazardType
  node_id: string | null
  edge_id: string | null
  verified: boolean
  source: string
  description: string
  created_at: string
}

export type RouteStep = { instruction: string; to_node: string; waypoint: WorldPosition; distance_m: number; bearing_degrees: number }
export type Route = {
  route_id: string
  status: 'candidate' | 'unreachable'
  start_node: string
  destination_node: string
  nodes: string[]
  edge_ids: string[]
  polyline: WorldPosition[]
  steps: RouteStep[]
  total_distance_m: number | null
  total_cost: number | null
  hazards_considered: string[]
  assumptions: string[]
  requires_command_approval: boolean
  unreachable_reason: string | null
  alternate?: Route | null
  meta?: { responder_id: string | null; civilian_id: string | null }
}

export type IncidentSnapshot = {
  building_id: string
  coordinate_frame: string
  timestamp: string
  entities: Entity[]
  hazards: Hazard[]
  routes: Route[]
  last_event_seq: number
}
export type SpreadPrediction = { fire_nodes: string[]; horizon_minutes: number; method: string; risk: Record<string, number>; provenance: string }
export type Recommendation = {
  civilian_id: string
  priority: ReviewPriority
  score: number
  reason: string
  flags: string[]
  nearest_responder_id: string | null
  route_status: 'candidate' | 'unreachable'
  estimated_cost: number | null
  requires_command_approval: boolean
}
export type Advisory = {
  civilian_id: string
  message: string
  requires_command_approval: boolean
  generated_at: string
  based_on: { hazard_ids: string[]; route_id: string | null; responder_en_route: boolean }
}
export type EngineEvent = { seq: number; timestamp: string; event_type: string; payload: Record<string, unknown> }
export type ReportResult = { civilian: Entity; report: CivilianReport; priority: TriagePriority }
export type ObservationInput = {
  observation_id: string
  type: 'fire' | 'smoke' | 'person'
  graph_node_id: string
  world_position: WorldPosition
  camera_id: string
  confidence: number
}
