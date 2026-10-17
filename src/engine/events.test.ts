import { describe, expect, it } from 'vitest'
import type { EngineEvent } from './types'
import { latestSeq, needsRefresh } from './events'

const ev = (seq: number, event_type: string): EngineEvent => ({ seq, timestamp: 't', event_type, payload: {} })

describe('engine events', () => {
  it('refreshes on world-changing events', () => {
    expect(needsRefresh([ev(1, 'hazard_added')])).toBe(true)
    expect(needsRefresh([ev(1, 'route_updated')])).toBe(true)
    expect(needsRefresh([ev(1, 'civilian_report')])).toBe(true)
  })

  it('ignores events emitted by the app’s own reads', () => {
    expect(needsRefresh([ev(1, 'advisory_drafted'), ev(2, 'rescue_prioritized')])).toBe(false)
    expect(needsRefresh([])).toBe(false)
  })

  it('tracks the highest sequence number', () => {
    expect(latestSeq([ev(4, 'a'), ev(7, 'b'), ev(5, 'c')], 3)).toBe(7)
    expect(latestSeq([], 9)).toBe(9)
  })
})
