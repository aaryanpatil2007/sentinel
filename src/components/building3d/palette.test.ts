import { describe, expect, it } from 'vitest'
import { PALETTE, TOKEN_HEXES, paletteColor, riskOpacity, toPaletteNeutral } from './palette'

describe('palette', () => {
  it('maps arbitrary demo colors onto neutral tokens', () => {
    expect(TOKEN_HEXES.has(toPaletteNeutral(0xd2ac73))).toBe(true)
    expect(toPaletteNeutral(0x202c32)).toBe(PALETTE.onSurface)
    expect(toPaletteNeutral(0xffffff)).toBe(PALETTE.surface)
  })

  it('keeps colors that already are tokens', () => {
    expect(paletteColor(PALETTE.primary)).toBe(PALETTE.primary)
    expect(paletteColor(PALETTE.error)).toBe(PALETTE.error)
  })

  it('scales risk into a capped opacity and drops negligible risk', () => {
    expect(riskOpacity(1)).toBeCloseTo(0.45)
    expect(riskOpacity(0.5)).toBeCloseTo(0.225)
    expect(riskOpacity(0.02)).toBe(0)
    expect(riskOpacity(3)).toBeCloseTo(0.45)
  })
})
