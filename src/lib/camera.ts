/** Stub camera registry. Replace with real feeds; keep the Camera shape. */
import type { Camera } from '../types'

const CAMERAS: Camera[] = [
  { id: 'cam-hall-2', label: 'Hall 2', pos: { floor: 2, x: 500, y: 150 }, status: 'live' },
  { id: 'cam-stair-a', label: 'Stair A', pos: { floor: 2, x: 80, y: 150 }, status: 'live' },
  { id: 'cam-lobby', label: 'Lobby', pos: { floor: 1, x: 500, y: 150 }, status: 'live' },
  { id: 'cam-hall-3', label: 'Hall 3', pos: { floor: 3, x: 500, y: 150 }, status: 'no-signal' },
]

export function getCameraFeeds(): Camera[] {
  return CAMERAS
}
