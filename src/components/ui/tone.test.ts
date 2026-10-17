import { describe, expect, it } from 'vitest'
import { STATUS_TONE, TONE_BG, TONE_FILL, TONE_TEXT, TONE_TINT } from './tone'

const TOKENS = [
  'surface', 'surface-container', 'surface-container-high', 'on-surface', 'on-surface-variant',
  'outline', 'primary', 'error', 'warning', 'success',
]

describe('tone maps', () => {
  it('reference only design tokens', () => {
    for (const map of [TONE_TEXT, TONE_BG, TONE_TINT, TONE_FILL]) {
      for (const cls of Object.values(map).flatMap((v) => v.split(' '))) {
        const token = cls.replace(/^(text|bg|border|fill)-/, '').replace(/\/\d+$/, '')
        expect(TOKENS).toContain(token)
      }
    }
  })

  it('cover every status', () => {
    expect(Object.keys(STATUS_TONE).sort()).toEqual(['evacuated', 'immobile', 'sheltering', 'trapped', 'unknown'])
  })
})
