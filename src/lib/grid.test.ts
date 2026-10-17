import { describe, expect, it } from 'vitest'
import { cellAt, cellIndex, emptyGrid, fillCells, hazardAt, maxHazardAlong, withCell } from './grid'

describe('cellAt', () => {
  it('maps plan coordinates to cells', () => {
    expect(cellAt(600, 150)).toEqual({ col: 14, row: 4 })
  })
  it('clamps points outside the plan', () => {
    expect(cellAt(1060, -5)).toEqual({ col: 23, row: 0 })
  })
})

describe('withCell', () => {
  it('returns a new grid and leaves the original untouched', () => {
    const grid = emptyGrid()
    const next = withCell(grid, 2, 3, 1, 2)
    expect(next[2][cellIndex(3, 1)]).toBe(2)
    expect(grid[2][cellIndex(3, 1)]).toBe(0)
    expect(next[1]).toBe(grid[1])
  })
  it('returns the same grid when nothing changes', () => {
    const grid = emptyGrid()
    expect(withCell(grid, 1, 0, 0, 0)).toBe(grid)
  })
})

describe('hazard sampling', () => {
  const grid = fillCells(fillCells(emptyGrid(), 3, [14, 14], [4, 4], 2), 3, [4, 5], [4, 4], 1)

  it('reads a single point', () => {
    expect(hazardAt(grid, { floor: 3, x: 600, y: 150 })).toBe(2)
    expect(hazardAt(grid, { floor: 2, x: 600, y: 150 })).toBe(0)
  })
  it('finds fire crossing a segment', () => {
    expect(maxHazardAlong(grid, 3, { x: 405, y: 150 }, { x: 880, y: 150 })).toBe(2)
  })
  it('reports smoke when there is no fire', () => {
    expect(maxHazardAlong(grid, 3, { x: 120, y: 150 }, { x: 405, y: 150 })).toBe(1)
  })
  it('reports clear segments', () => {
    expect(maxHazardAlong(grid, 4, { x: 120, y: 150 }, { x: 880, y: 150 })).toBe(0)
  })
})
