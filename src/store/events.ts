import type { Message, Thread } from '../types'
import { threadIdFor } from '../data/scenarioThreads'
import { civilianStatus, civiliansOf, describeEvacuationChange, statusChangeText, type NodeIndex } from '../engine/derive'
import type { IncidentSnapshot, Route } from '../engine/types'
import { SYSTEM_SENDER } from '../lib/labels'

let sequence = 0

export function newMessageId(now: number): string {
  sequence += 1
  return `m-${now.toString(36)}-${sequence}`
}

export function systemMessage(civilianId: string, text: string, now: number): Message {
  return { id: newMessageId(now), threadId: threadIdFor(civilianId), from: 'system', sender: SYSTEM_SENDER, text, at: now }
}

type Observation = { snapshot: IncidentSnapshot | null; evacuations: Record<string, Route | null> }

/** System messages for status and evacuation-route changes between two engine observations. */
export function incidentChangeMessages(prev: Observation, next: Observation, nodes: NodeIndex, now: number): Message[] {
  if (!prev.snapshot) return []
  const before = new Map(civiliansOf(prev.snapshot).map((c) => [c.entity_id, c]))
  const messages: Message[] = []
  for (const civilian of civiliansOf(next.snapshot)) {
    const old = before.get(civilian.entity_id)
    if (!old) continue
    const status = civilianStatus(civilian, nodes)
    const statusText = statusChangeText(civilianStatus(old, nodes), status)
    if (statusText) messages.push(systemMessage(civilian.entity_id, statusText, now))
    if (status === 'evacuated') continue
    const routeText = describeEvacuationChange(prev.evacuations[civilian.entity_id], next.evacuations[civilian.entity_id], nodes)
    if (routeText) messages.push(systemMessage(civilian.entity_id, routeText, now))
  }
  return messages
}

/** Appends messages to their threads. Resident messages count as unread for responders. */
export function appendMessages(threads: Thread[], messages: Message[]): Thread[] {
  if (messages.length === 0) return threads
  return threads.map((t) => {
    const mine = messages.filter((m) => m.threadId === t.id)
    if (mine.length === 0) return t
    return { ...t, messages: [...t.messages, ...mine], unread: t.unread + mine.filter((m) => m.from === 'resident').length }
  })
}
