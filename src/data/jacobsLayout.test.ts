import { describe, expect, it } from 'vitest'
import { ENGINE_FIXTURE } from '../engine/fixture'
import { ENTRANCES, FOOTPRINTS, FURNISHINGS, SHELL, contains, footprintFor } from './jacobsLayout'

const DRAWN_TYPES = new Set(['room', 'corridor', 'stairs', 'elevator', 'staging'])
const nodes = ENGINE_FIXTURE.graph.nodes

describe('jacobsLayout', () => {
  it('gives every drawn engine node a footprint that contains it', () => {
    for (const n of nodes.filter((node) => DRAWN_TYPES.has(node.node_type))) {
      const fp = footprintFor(n.node_id)
      expect(fp, n.node_id).toBeDefined()
      expect(fp?.floor, n.node_id).toBe(n.floor_id)
      expect(fp && contains(fp, n.x, n.y), n.node_id).toBe(true)
    }
  })

  it('only references real nodes', () => {
    const ids = new Set(nodes.map((n) => n.node_id))
    for (const fp of FOOTPRINTS) if (fp.nodeId) expect(ids.has(fp.nodeId), fp.id).toBe(true)
    for (const e of ENTRANCES) expect(ids.has(e.nodeId)).toBe(true)
  })

  it('keeps building footprints inside the shell', () => {
    for (const fp of FOOTPRINTS.filter((f) => f.kind !== 'staging')) {
      expect(fp.x0 >= SHELL.x0 && fp.x1 <= SHELL.x1 && fp.y0 >= SHELL.y0 && fp.y1 <= SHELL.y1, fp.id).toBe(true)
    }
  })

  it('keeps every furnishing inside its room', () => {
    for (const f of FURNISHINGS) {
      const room = footprintFor(f.nodeId)
      expect(room, f.id).toBeDefined()
      if (!room) continue
      expect(contains(room, f.x - f.w / 2, f.y - f.d / 2) && contains(room, f.x + f.w / 2, f.y + f.d / 2), f.id).toBe(true)
    }
  })

  it('does not overlap footprints on the same floor', () => {
    const area = FOOTPRINTS.filter((f) => f.kind !== 'staging')
    for (const a of area) {
      for (const b of area) {
        if (a === b || a.floor !== b.floor) continue
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
        expect(overlap, `${a.id} × ${b.id}`).toBe(false)
      }
    }
  })
})
