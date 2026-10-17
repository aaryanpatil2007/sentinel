import type { Floor, HazardGrid, HazardValue, Point } from '../types'
import { PLAN_H, PLAN_W, type XY } from './geometry'

export const GRID_COLS = 24
export const GRID_ROWS = 8
export const CELL_W = PLAN_W / GRID_COLS
export const CELL_H = PLAN_H / GRID_ROWS
const SAMPLE_STEP = 10

export type Cell = { col: number; row: number }

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi)

export function cellAt(x: number, y: number): Cell {
  return {
    col: clamp(Math.floor(x / CELL_W), 0, GRID_COLS - 1),
    row: clamp(Math.floor(y / CELL_H), 0, GRID_ROWS - 1),
  }
}

export function cellIndex(col: number, row: number): number {
  return row * GRID_COLS + col
}

export function emptyGrid(): HazardGrid {
  const blank = () => new Array<HazardValue>(GRID_COLS * GRID_ROWS).fill(0)
  return { 1: blank(), 2: blank(), 3: blank(), 4: blank() }
}

export function hazardAt(grid: HazardGrid, p: Point): HazardValue {
  const { col, row } = cellAt(p.x, p.y)
  return grid[p.floor][cellIndex(col, row)] ?? 0
}

export function withCell(grid: HazardGrid, floor: Floor, col: number, row: number, value: HazardValue): HazardGrid {
  const i = cellIndex(col, row)
  if (grid[floor][i] === value) return grid
  const cells = grid[floor].slice()
  cells[i] = value
  return { ...grid, [floor]: cells }
}

/** Inclusive column and row ranges. */
export function fillCells(
  grid: HazardGrid,
  floor: Floor,
  cols: [number, number],
  rows: [number, number],
  value: HazardValue,
): HazardGrid {
  let next = grid
  for (let row = rows[0]; row <= rows[1]; row++) {
    for (let col = cols[0]; col <= cols[1]; col++) next = withCell(next, floor, col, row, value)
  }
  return next
}

export function maxHazardAlong(grid: HazardGrid, floor: Floor, a: XY, b: XY): HazardValue {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SAMPLE_STEP))
  let max: HazardValue = 0
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const v = hazardAt(grid, { floor, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
    if (v > max) max = v
    if (max === 2) break
  }
  return max
}
