import type { Priority } from '../../types'

/** The M3 token palette as three.js hex numbers. Nothing else is drawn. */
export const PALETTE = {
  surface: 0xfbf9f6,
  surfaceContainer: 0xf3f1ee,
  surfaceContainerHigh: 0xeceae7,
  onSurface: 0x1c1b19,
  onSurfaceVariant: 0x5f5e5a,
  outline: 0xc8c6c2,
  primary: 0x1f4e79,
  error: 0xb3261e,
  warning: 0x8a5a00,
  success: 0x2e6b3f,
} as const

export const TOKEN_HEXES: ReadonlySet<number> = new Set(Object.values(PALETTE))

export const TONE_HEX: Record<Priority, number> = { critical: PALETTE.error, moderate: PALETTE.warning, safe: PALETTE.success }

const NEUTRALS = [PALETTE.surface, PALETTE.surfaceContainer, PALETTE.surfaceContainerHigh, PALETTE.outline, PALETTE.onSurfaceVariant, PALETTE.onSurface]
const MAX_RISK_OPACITY = 0.45
const MIN_VISIBLE_RISK = 0.05

function luminance(hex: number): number {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Nearest neutral token by luminance, so demo furniture keeps its light/dark structure inside the palette. */
export function toPaletteNeutral(hex: number): number {
  const target = luminance(hex)
  return NEUTRALS.reduce((best, c) => (Math.abs(luminance(c) - target) < Math.abs(luminance(best) - target) ? c : best))
}

export function paletteColor(hex: number): number {
  return TOKEN_HEXES.has(hex) ? hex : toPaletteNeutral(hex)
}

export function riskOpacity(risk: number): number {
  if (risk < MIN_VISIBLE_RISK) return 0
  return Math.min(MAX_RISK_OPACITY, risk * MAX_RISK_OPACITY)
}
