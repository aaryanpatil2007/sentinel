import type { ReviewPriority } from '../engine/types'
import type { Priority, QuickReply } from '../types'

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  safe: 'Safe',
}

export const REVIEW_PRIORITY_LABEL: Record<ReviewPriority, string> = {
  urgent_review: 'Urgent',
  priority_review: 'Priority',
  standard_review: 'Standard',
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

/** Phrases appended to a civilian's report so the engine's triage rules pick them up. */
export const QUICK_REPLY_REPORT_TEXT: Record<Exclude<QuickReply, 'out'>, string> = {
  trapped: "I'm trapped.",
  'cant-move': "I can't move.",
}

export const RESPONDER_LABEL: Record<string, string> = { UNIT_ALPHA: 'Alpha', UNIT_BRAVO: 'Bravo' }
export const RESPONDER_SENDER = 'E7 · Reyes'
export const SYSTEM_SENDER = 'Sentinel'
export const MAX_MESSAGE_LENGTH = 500
