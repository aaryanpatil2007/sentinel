import { describe, expect, it } from 'vitest'
import config from '../tailwind.config.js'

const ALLOWED_COLORS = [
  '#FBF9F6', '#F3F1EE', '#ECEAE7', '#1C1B19', '#5F5E5A',
  '#C8C6C2', '#1F4E79', '#B3261E', '#8A5A00', '#2E6B3F',
]

describe('design tokens', () => {
  it('exposes only the M3 color roles', () => {
    const hexes = Object.values(config.theme.colors).filter((v) => String(v).startsWith('#'))
    expect(new Set(hexes)).toEqual(new Set(ALLOWED_COLORS))
  })

  it('restricts font sizes to the type scale', () => {
    const sizes = Object.keys(config.theme.fontSize).map(Number).sort((a, b) => a - b)
    expect(sizes).toEqual([11, 12, 14, 16, 18, 24])
  })

  it('restricts weights to 400, 500, 600', () => {
    expect(Object.values(config.theme.fontWeight).sort()).toEqual(['400', '500', '600'])
  })

  it('restricts radius to 8, 12, 16 and full', () => {
    expect(config.theme.borderRadius).toEqual({ none: '0', 8: '8px', 12: '12px', 16: '16px', full: '999px' })
  })
})
