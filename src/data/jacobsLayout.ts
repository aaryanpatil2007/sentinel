/**
 * Presentation geometry for Jacobs Hall in engine coordinates (JACOBS_LOCAL meters, x east, y north).
 * The engine graph only has points; these footprints give them shape for the 3D view.
 * Illustrative, like the engine's own coordinates. Each footprint must contain its node.
 */
import type { FloorId } from '../engine/types'

export const SHELL = { x0: 0, y0: 0, x1: 40, y1: 20 } as const

export type FootprintKind = 'room' | 'corridor' | 'stairs' | 'elevator' | 'lobby' | 'staging'
export type Footprint = { id: string; nodeId: string | null; floor: FloorId; kind: FootprintKind; x0: number; y0: number; x1: number; y1: number; label: string }

const ROOMS: Record<FloorId, [west: { id: string; label: string }, east: { id: string; label: string }]> = {
  B: [{ id: 'B_STUDIO_10', label: 'Studio 10' }, { id: 'B_METAL_SHOP', label: 'Metal Shop' }],
  F1: [{ id: 'F1_STUDIO_110', label: 'Studio 110' }, { id: 'F1_STUDIO_120', label: 'Studio 120' }],
  F2: [{ id: 'F2_STUDIO_210', label: 'Studio 210' }, { id: 'F2_STUDIO_220', label: 'Studio 220' }],
  F3: [{ id: 'F3_STUDIO_310', label: 'Studio 310' }, { id: 'F3_PROTOTYPING_LAB', label: 'Advanced Prototyping Lab' }],
}

function floorFootprints(floor: FloorId): Footprint[] {
  const [west, east] = ROOMS[floor]
  const fp = (id: string, kind: FootprintKind, x0: number, y0: number, x1: number, y1: number, label: string): Footprint => ({
    id, nodeId: id, floor, kind, x0, y0, x1, y1, label,
  })
  return [
    fp(`${floor}_STAIR_A`, 'stairs', 2, 7, 8, 13, 'West stair'),
    fp(`${floor}_STAIR_B`, 'stairs', 32, 7, 38, 13, 'East stair'),
    fp(`${floor}_CORRIDOR_WEST`, 'corridor', 8, 8, 16, 12, 'West corridor'),
    fp(`${floor}_CORRIDOR_CENTER`, 'corridor', 16, 8, 24, 12, 'Center corridor'),
    fp(`${floor}_CORRIDOR_EAST`, 'corridor', 24, 8, 32, 12, 'East corridor'),
    fp(`${floor}_ELEVATOR`, 'elevator', 19, 12, 21, 14, 'Elevator'),
    fp(west.id, 'room', 2, 14, 19, 20, west.label),
    fp(east.id, 'room', 21, 14, 38, 20, east.label),
  ]
}

export const FOOTPRINTS: Footprint[] = [
  ...(['B', 'F1', 'F2', 'F3'] as const).flatMap(floorFootprints),
  { id: 'F1_LOBBY', nodeId: null, floor: 'F1', kind: 'lobby', x0: 8, y0: 0.5, x1: 38, y1: 7, label: 'Lobby' },
  { id: 'EXT_STAGING', nodeId: 'EXT_STAGING', floor: 'F1', kind: 'staging', x0: 14, y0: -13, x1: 26, y1: -7, label: 'Staging' },
]

export const ENTRANCES = [
  { nodeId: 'F1_ENTRANCE_MAIN', x: 20, y: 0, label: 'Main entrance' },
  { nodeId: 'F1_ENTRANCE_EAST', x: 35, y: 0, label: 'East entrance' },
] as const

/** Demo furnishing kinds (demo/src/furnishings.js), placed in engine meters. w along x, d along y. */
export type FurnishingSpec = { id: string; nodeId: string; kind: string; x: number; y: number; w: number; d: number; h: number }

const f = (id: string, nodeId: string, kind: string, x: number, y: number, w: number, d: number, h: number): FurnishingSpec => ({ id, nodeId, kind, x, y, w, d, h })

export const FURNISHINGS: FurnishingSpec[] = [
  f('b10-bench-1', 'B_STUDIO_10', 'workbench', 6, 17.5, 2.2, 2, 1),
  f('b10-bench-2', 'B_STUDIO_10', 'workbench', 16, 17.5, 2.2, 2, 1),
  f('b10-screen', 'B_STUDIO_10', 'display', 10.5, 19.4, 3.6, 0.5, 1.7),
  f('metal-waterjet', 'B_METAL_SHOP', 'waterjet', 26, 18.4, 3.6, 2.5, 1.25),
  f('metal-saw', 'B_METAL_SHOP', 'bandsaw', 33, 18.6, 1.2, 1.4, 1.7),
  f('metal-weld', 'B_METAL_SHOP', 'welding', 35.5, 15.5, 1.5, 1.5, 1.25),
  f('110-laser', 'F1_STUDIO_110', 'laser', 6, 18.5, 3.3, 1.8, 1.3),
  f('110-printers', 'F1_STUDIO_110', 'printerBank', 15.5, 18.5, 3.1, 1.8, 1.7),
  f('110-robot', 'F1_STUDIO_110', 'robotArm', 5, 15.2, 1.7, 1.8, 1.8),
  f('120-cnc', 'F1_STUDIO_120', 'cnc', 25.5, 18.4, 4.2, 2.5, 1.3),
  f('120-tablesaw', 'F1_STUDIO_120', 'tableSaw', 33, 18.5, 2.1, 1.8, 1.05),
  f('120-bandsaw', 'F1_STUDIO_120', 'bandsaw', 36, 15.5, 1.2, 1.3, 1.7),
  f('210-desk-1', 'F2_STUDIO_210', 'desk', 4.5, 18.5, 1.6, 2, 1.2),
  f('210-desk-2', 'F2_STUDIO_210', 'desk', 7.5, 18.5, 1.6, 2, 1.2),
  f('210-desk-3', 'F2_STUDIO_210', 'desk', 16, 18.5, 1.6, 2, 1.2),
  f('210-lounge', 'F2_STUDIO_210', 'lounge', 16.5, 15.2, 2.5, 1.2, 1),
  f('220-table-1', 'F2_STUDIO_220', 'teachingTable', 25, 18.3, 3, 2, 1),
  f('220-table-2', 'F2_STUDIO_220', 'teachingTable', 32, 15.5, 3, 2, 1),
  f('220-board', 'F2_STUDIO_220', 'whiteboard', 34, 19.4, 3, 0.6, 1.5),
  f('310-wall', 'F3_STUDIO_310', 'display', 10.5, 19.5, 6.5, 0.5, 1.7),
  f('310-table-1', 'F3_STUDIO_310', 'teachingTable', 5.5, 16, 2.6, 1.6, 1),
  f('310-table-2', 'F3_STUDIO_310', 'teachingTable', 16.5, 16, 2.6, 1.6, 1),
  f('lab-resin-1', 'F3_PROTOTYPING_LAB', 'resinPrinter', 24, 18.6, 1.5, 1.7, 1.7),
  f('lab-fortus', 'F3_PROTOTYPING_LAB', 'enclosedPrinter', 27, 18.6, 1.7, 1.9, 1.9),
  f('lab-resin-2', 'F3_PROTOTYPING_LAB', 'resinPrinter', 35.5, 18.6, 1.5, 1.7, 1.7),
]

const BY_NODE = new Map(FOOTPRINTS.filter((fp) => fp.nodeId).map((fp) => [fp.nodeId as string, fp]))

export function footprintFor(nodeId: string): Footprint | undefined {
  return BY_NODE.get(nodeId)
}

export function contains(fp: Footprint, x: number, y: number): boolean {
  return x >= fp.x0 && x <= fp.x1 && y >= fp.y0 && y <= fp.y1
}
