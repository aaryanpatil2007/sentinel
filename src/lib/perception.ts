/**
 * Stub perception. The real version turns camera frames into fire/smoke cells and people positions.
 * Return only what was detected; applyDetection merges it into the world.
 */
import type { Camera, HazardGrid, Person, World } from '../types'

export type Detection = { people?: Person[]; hazards?: HazardGrid }

export function detect(_feeds: Camera[], _world: World): Detection {
  return {}
}

export function applyDetection(world: World, detection: Detection): World {
  return {
    ...world,
    people: detection.people ?? world.people,
    hazards: detection.hazards ?? world.hazards,
  }
}
