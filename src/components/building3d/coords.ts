import * as THREE from 'three'
import { FLOOR_ELEVATION, type FloorId } from '../../engine/types'

/** Engine point at the center of the 40×20 m footprint becomes the scene origin. */
export const ORIGIN = { x: 20, y: 10 } as const
/** Scene units per meter of elevation: 4 m floors are drawn 7 units apart so every floor stays visible. */
export const FLOOR_SPACING = 7 / 4
export const SLAB = 0.25

export function floorY(floor: FloorId): number {
  return FLOOR_ELEVATION[floor] * FLOOR_SPACING
}

export function toScene(x: number, y: number, floor: FloorId, lift = 0): THREE.Vector3 {
  return new THREE.Vector3(x - ORIGIN.x, floorY(floor) + lift, -(y - ORIGIN.y))
}
