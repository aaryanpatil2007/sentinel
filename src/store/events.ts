import type { Message, Route, Status, Thread, World } from '../types'
import { threadIdFor } from '../data/mock'
import { STATUS_LABEL, SYSTEM_SENDER } from '../lib/labels'
import { routeFor } from '../lib/routing'

let sequence = 0

export function newMessageId(now: number): string {
  sequence += 1
  return `m-${now.toString(36)}-${sequence}`
}

export function systemMessage(personId: string, text: string, now: number): Message {
  return { id: newMessageId(now), threadId: threadIdFor(personId), from: 'system', sender: SYSTEM_SENDER, text, at: now }
}

export function statusMessage(personId: string, status: Status, now: number): Message {
  return systemMessage(personId, `Status changed to ${STATUS_LABEL[status]}`, now)
}

function describeRouteChange(prev: Route, next: Route): string | null {
  if (next.via === null) return null
  if (next.blocked && !prev.blocked) return 'Route blocked · Shelter in place'
  if (!next.blocked && prev.blocked) return `Route open · Take Stair ${next.via}`
  if (!next.blocked && prev.via !== null && prev.via !== next.via) return `Route updated · Stair ${prev.via} → Stair ${next.via}`
  return null
}

export function routeChangeMessages(prev: World, next: World, now: number): Message[] {
  const messages: Message[] = []
  for (const person of next.people) {
    const before = prev.people.find((p) => p.id === person.id)
    if (!before) continue
    const text = describeRouteChange(routeFor(before, prev), routeFor(person, next))
    if (text) messages.push(systemMessage(person.id, text, now))
  }
  return messages
}

/** Appends messages to their threads. Resident messages count as unread for responders. */
export function appendMessages(threads: Thread[], messages: Message[]): Thread[] {
  if (messages.length === 0) return threads
  return threads.map((t) => {
    const mine = messages.filter((m) => m.threadId === t.id)
    if (mine.length === 0) return t
    return {
      ...t,
      messages: [...t.messages, ...mine],
      unread: t.unread + mine.filter((m) => m.from === 'resident').length,
    }
  })
}
