import type { Message, QuickReply, Thread } from '../types'
import { threadIdFor } from '../data/mock'
import { MAX_MESSAGE_LENGTH, QUICK_REPLY_LABEL, RESPONDER_SENDER, residentSender } from '../lib/labels'
import { appendMessages, newMessageId, statusMessage } from './events'
import { applyQuickReply } from './quickReply'
import type { SliceCreator } from './types'

export type CommsSlice = {
  threads: Thread[]
  sendMessage: (threadId: string, from: 'resident' | 'responder', text: string) => void
  sendQuickReply: (personId: string, reply: QuickReply) => void
  clearThread: (threadId: string) => void
  markRead: (threadId: string) => void
}

export const createCommsSlice =
  (initial: Thread[]): SliceCreator<CommsSlice> =>
  (set, get) => ({
    threads: initial,

    sendMessage: (threadId, from, raw) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH)
      if (!text) return
      const { threads, world } = get()
      const thread = threads.find((t) => t.id === threadId)
      if (!thread) return
      const now = Date.now()
      const person = thread.personId ? world.people.find((p) => p.id === thread.personId) : undefined
      const message: Message = {
        id: newMessageId(now),
        threadId,
        from,
        sender: from === 'responder' ? RESPONDER_SENDER : residentSender(person?.unit ?? ''),
        text,
        at: now,
      }
      const touchPerson = person && from === 'resident'
      set({
        threads: appendMessages(threads, [message]),
        world: touchPerson
          ? { ...world, people: world.people.map((p) => (p.id === person.id ? { ...p, lastUpdate: now } : p)) }
          : world,
      })
    },

    sendQuickReply: (personId, reply) => {
      const { world, commitWorld } = get()
      const person = world.people.find((p) => p.id === personId)
      if (!person) return
      const now = Date.now()
      const updated = applyQuickReply(person, reply, world, now)
      const chip: Message = {
        id: newMessageId(now),
        threadId: threadIdFor(personId),
        from: 'resident',
        sender: residentSender(person.unit),
        text: QUICK_REPLY_LABEL[reply],
        quick: reply,
        at: now,
      }
      const messages = updated.status !== person.status ? [chip, statusMessage(personId, updated.status, now)] : [chip]
      commitWorld({ ...world, people: world.people.map((p) => (p.id === personId ? updated : p)) }, messages)
    },

    clearThread: (threadId) =>
      set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, messages: [], unread: 0 } : t)) })),

    markRead: (threadId) => {
      const thread = get().threads.find((t) => t.id === threadId)
      if (!thread || thread.unread === 0) return
      set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)) }))
    },
  })
