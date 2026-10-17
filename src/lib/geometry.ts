import type { Floor, Point, StairId } from '../types'

export type XY = { x: number; y: number }

/** Per-floor plan space. Every position in the app uses these units. */
export const PLAN_W = 1000
export const PLAN_H = 300

export const WALL = { x0: 40, x1: 960, y0: 20, y1: 280 } as const
export const HALL = { x0: 120, x1: 880, y0: 120, y1: 180, y: 150 } as const
export const UNIT_COLUMNS = [120, 310, 500, 690, 880] as const
export const TOP_LETTERS = ['A', 'B', 'C', 'D'] as const
export const BOTTOM_LETTERS = ['E', 'F', 'G', 'H'] as const
export const UNIT_ROWS = {
  top: { y0: 20, y1: 120, cy: 70 },
  bottom: { y0: 180, y1: 280, cy: 230 },
} as const

export const STAIRS: Record<StairId, { entry: XY; center: XY; exit: XY; x0: number; x1: number }> = {
  A: { entry: { x: 120, y: 150 }, center: { x: 80, y: 150 }, exit: { x: 10, y: 150 }, x0: 40, x1: 120 },
  B: { entry: { x: 880, y: 150 }, center: { x: 920, y: 150 }, exit: { x: 990, y: 150 }, x0: 880, x1: 960 },
}

export const STAGING_X = 1060
export const STAGING: Point = { floor: 1, x: STAGING_X, y: 150 }

export const METERS_PER_UNIT = 0.05
export const FLOOR_CHANGE_M = 4
export const WALK_SPEED_MPS = 1.2

export function isFloor(n: number): n is Floor {
  return n === 1 || n === 2 || n === 3 || n === 4
}

export function pointOn(floor: Floor, xy: XY): Point {
  return { floor, x: xy.x, y: xy.y }
}

function columnIndex(x: number): number {
  for (let i = 0; i < UNIT_COLUMNS.length - 1; i++) {
    if (x >= UNIT_COLUMNS[i] && x < UNIT_COLUMNS[i + 1]) return i
  }
  return -1
}

function columnCenter(i: number): number {
  return (UNIT_COLUMNS[i] + UNIT_COLUMNS[i + 1]) / 2
}

export function unitCenter(unit: string): Point {
  const floor = Number(unit[0])
  const letter = unit.slice(1)
  if (!isFloor(floor)) throw new Error(`Unknown unit: ${unit}`)
  const top = (TOP_LETTERS as readonly string[]).indexOf(letter)
  if (top >= 0) return { floor, x: columnCenter(top), y: UNIT_ROWS.top.cy }
  const bottom = (BOTTOM_LETTERS as readonly string[]).indexOf(letter)
  if (bottom >= 0) return { floor, x: columnCenter(bottom), y: UNIT_ROWS.bottom.cy }
  throw new Error(`Unknown unit: ${unit}`)
}

export function unitAt(p: Point): string | null {
  const col = columnIndex(p.x)
  if (col < 0) return null
  if (p.y >= UNIT_ROWS.top.y0 && p.y < UNIT_ROWS.top.y1) return `${p.floor}${TOP_LETTERS[col]}`
  if (p.y >= UNIT_ROWS.bottom.y0 && p.y < UNIT_ROWS.bottom.y1) return `${p.floor}${BOTTOM_LETTERS[col]}`
  return null
}

/** Where a person at `p` steps into the hallway. */
export function doorFor(p: Point): XY {
  const col = columnIndex(p.x)
  if (col >= 0 && p.y < HALL.y0) return { x: columnCenter(col), y: HALL.y0 }
  if (col >= 0 && p.y >= HALL.y1) return { x: columnCenter(col), y: HALL.y1 }
  return { x: Math.min(Math.max(p.x, HALL.x0), HALL.x1), y: HALL.y }
}

export function isInsideBuilding(p: Point): boolean {
  return p.x >= WALL.x0 && p.x <= WALL.x1 && p.y >= WALL.y0 && p.y <= WALL.y1
}

export function isAtStaging(p: Point): boolean {
  return p.x > WALL.x1 + 20
}

export function stagingSpot(index: number): Point {
  return { floor: 1, x: STAGING_X, y: 86 + (index % 5) * 40 }
}
