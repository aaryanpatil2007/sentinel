import type { CivilianStatus } from '../../engine/derive'
import type { Priority } from '../../types'

export type Tone = Priority | 'primary' | 'neutral'

export const TONE_TEXT: Record<Tone, string> = {
  critical: 'text-error',
  moderate: 'text-warning',
  safe: 'text-success',
  primary: 'text-primary',
  neutral: 'text-on-surface-variant',
}

export const TONE_BG: Record<Tone, string> = {
  critical: 'bg-error',
  moderate: 'bg-warning',
  safe: 'bg-success',
  primary: 'bg-primary',
  neutral: 'bg-on-surface-variant',
}

export const TONE_TINT: Record<Tone, string> = {
  critical: 'bg-error/10 border-error/30',
  moderate: 'bg-warning/10 border-warning/30',
  safe: 'bg-success/10 border-success/30',
  primary: 'bg-primary/10 border-primary/30',
  neutral: 'bg-surface-container-high border-outline',
}

export const TONE_FILL: Record<Tone, string> = {
  critical: 'fill-error',
  moderate: 'fill-warning',
  safe: 'fill-success',
  primary: 'fill-primary',
  neutral: 'fill-on-surface-variant',
}

export const STATUS_TONE: Record<CivilianStatus, Tone> = {
  trapped: 'critical',
  immobile: 'critical',
  sheltering: 'moderate',
  evacuated: 'safe',
  unknown: 'neutral',
}
