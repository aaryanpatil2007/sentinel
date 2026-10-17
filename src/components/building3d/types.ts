import type { FloorId, HazardType, WorldPosition } from '../../engine/types'
import type { FloorFilter, Priority } from '../../types'

export type SceneMarker = {
  id: string
  kind: 'civilian' | 'responder'
  floor: FloorId
  x: number
  y: number
  label: string
  tone: Priority
  selected?: boolean
  emphasized?: boolean
}
export type SceneHazard = { id: string; type: HazardType; floor: FloorId; x: number; y: number }
export type ScenePath = { id: string; points: WorldPosition[]; variant: 'rescue' | 'evacuation'; emphasized?: boolean; dimmed?: boolean }

export type SceneInput = {
  markers: SceneMarker[]
  hazards: SceneHazard[]
  paths: ScenePath[]
  risk: Record<string, number>
  showFire: boolean
  showSmoke: boolean
  showRisk: boolean
  floor: FloorFilter
  /** Resident view: dim every floor except this one. */
  focusFloor?: FloorId | null
  highlightNodeId?: string | null
  highlightTone?: 'primary' | 'warning'
  /** Sim mode: clicking a room or corridor reports its node. */
  pickableNodes?: boolean
}

export type SceneCallbacks = {
  onPickEntity?: (id: string) => void
  onPickNode?: (nodeId: string) => void
  onPickHazard?: (hazardId: string) => void
}
