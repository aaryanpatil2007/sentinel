import { describe, expect, it } from 'vitest'
import { RESPONDER_SENDER } from '../../lib/labels'
import { isOwnMessage } from './isOwnMessage'

describe('isOwnMessage', () => {
  it('does not mark other crew as own on the firefighter side', () => {
    expect(isOwnMessage({ from: 'responder', sender: 'L3 · Okafor' }, 'responder')).toBe(false)
  })
  it('marks E7 as own on the firefighter side', () => {
    expect(isOwnMessage({ from: 'responder', sender: RESPONDER_SENDER }, 'responder')).toBe(true)
  })
  it('marks resident messages as own on the resident side', () => {
    expect(isOwnMessage({ from: 'resident', sender: 'Anyone' }, 'resident')).toBe(true)
  })
  it('does not mark responders as own on the resident side', () => {
    expect(isOwnMessage({ from: 'responder', sender: RESPONDER_SENDER }, 'resident')).toBe(false)
  })
})
