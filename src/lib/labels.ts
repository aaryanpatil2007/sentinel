import type { Priority, QuickReply, Status } from '../types'

export const STATUS_LABEL: Record<Status, string> = {
  trapped: 'Trapped',
  immobile: "Can't move",
  sheltering: 'Sheltering',
  evacuating: 'Evacuating',
  evacuated: 'Evacuated',
  unknown: 'No response',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  safe: 'Safe',
}

export const QUICK_REPLY_LABEL: Record<QuickReply, string> = {
  out: "I'm out",
  trapped: "I'm trapped",
  'cant-move': "Can't move",
}

/** Chip color for each quick reply: success, error, warning. */
export const QUICK_REPLY_TONE: Record<QuickReply, Priority> = {
  out: 'safe',
  trapped: 'critical',
  'cant-move': 'moderate',
}

export const RESPONDER_SENDER = 'E7 · Reyes'
export const SYSTEM_SENDER = 'Sentinel'
export const residentSender = (unit: string) => `Unit ${unit}`
export const MAX_MESSAGE_LENGTH = 500
