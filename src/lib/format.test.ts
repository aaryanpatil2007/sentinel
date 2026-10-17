import { describe, expect, it } from 'vitest'
import { formatAgo, formatClock, formatCoords, formatDistance, formatElapsed, formatEta, splitEmphasis } from './format'

describe('format', () => {
  it('formats a wall clock time', () => {
    expect(formatClock(new Date(2026, 9, 17, 14, 32, 8).getTime())).toBe('14:32:08')
  })
  it('formats elapsed time', () => {
    expect(formatElapsed(14 * 60_000 + 5_000)).toBe('00:14:05')
    expect(formatElapsed(-1)).toBe('00:00:00')
  })
  it('formats relative time', () => {
    const now = 10_000_000
    expect(formatAgo(now - 20_000, now)).toBe('just now')
    expect(formatAgo(now - 3 * 60_000, now)).toBe('3 min ago')
    expect(formatAgo(now - 2 * 3_600_000, now)).toBe('2 h ago')
  })
  it('formats distance, ETA and coordinates', () => {
    expect(formatDistance(37.6)).toBe('38 m')
    expect(formatEta(130)).toBe('2:10')
    expect(formatCoords({ floor: 3, x: 412.4, y: 188.6 })).toBe('F3 · 412, 189')
  })
  it('splits uppercase instruction keywords for emphasis', () => {
    expect(splitEmphasis('Turn RIGHT, take STAIR B down.')).toEqual([
      { text: 'Turn ', strong: false },
      { text: 'RIGHT', strong: true },
      { text: ', take ', strong: false },
      { text: 'STAIR B', strong: true },
      { text: ' down.', strong: false },
    ])
    expect(splitEmphasis('Responders know you are in 3B.')).toEqual([
      { text: 'Responders know you are in 3B.', strong: false },
    ])
  })
})
