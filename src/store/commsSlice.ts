import type { Message, QuickReply, Thread } from '../types'
import { threadIdFor } from '../data/scenarioThreads'
import { civiliansOf, indexNodes, placeLabel } from '../engine/derive'
import { MAX_MESSAGE_LENGTH, QUICK_REPLY_LABEL, QUICK_REPLY_REPORT_TEXT, RESPONDER_SENDER } from '../lib/labels'
import { STAGING_NODE } from './engineSlice'
import { appendMessages, newMessageId } from './events'
import type { SentinelState, SliceCreator } from './types'

export type CommsSlice = {
  threads: Thread[]
  sendMessage: (threadId: string, from: 'resident' | 'responder', text: string) => void
  sendQuickReply: (civilianId: string, reply: QuickReply) => void
  clearThread: (threadId: string) => void
  markRead: (threadId: string) => void
}

function residentName(state: SentinelState, civilianId: string | undefined): string {
  const civilian = civiliansOf(state.snapshot).find((c) => c.entity_id === civilianId)
  return civilian ? placeLabel(civilian, indexNodes(state.graph)) : 'Resident'
}

export const createCommsSlice =
  (initial: Thread[]): SliceCreator<CommsSlice> =>
  (set, get) => ({
    threads: initial,

    sendMessage: (threadId, from, raw) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH)
      if (!text) return
      const thread = get().threads.find((t) => t.id === threadId)
      if (!thread) return
      const now = Date.now()
      const message: Message = {
        id: newMessageId(now),
        threadId,
        from,
        sender: from === 'responder' ? RESPONDER_SENDER : residentName(get(), thread.personId),
        text,
        at: now,
      }
      set((s) => ({ threads: appendMessages(s.threads, [message]) }))
      if (from === 'resident' && thread.personId) void get().reportCivilian(thread.personId, text)
    },

    sendQuickReply: (civilianId, reply) => {
      const now = Date.now()
      const chip: Message = {
        id: newMessageId(now),
        threadId: threadIdFor(civilianId),
        from: 'resident',
        sender: residentName(get(), civilianId),
        text: QUICK_REPLY_LABEL[reply],
        quick: reply,
        at: now,
      }
      set((s) => ({ threads: appendMessages(s.threads, [chip]) }))
      void (reply === 'out' ? get().moveCivilian(civilianId, STAGING_NODE) : get().reportCivilian(civilianId, QUICK_REPLY_REPORT_TEXT[reply]))
    },

    clearThread: (threadId) =>
      set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, messages: [], unread: 0 } : t)) })),

    markRead: (threadId) => {
      const thread = get().threads.find((t) => t.id === threadId)
      if (!thread || thread.unread === 0) return
      set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)) }))
    },
  })
