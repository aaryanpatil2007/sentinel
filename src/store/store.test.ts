import { beforeEach, describe, expect, it } from 'vitest'
import { CREW_THREAD_ID, createMockState, threadIdFor } from '../data/mock'
import { isAtStaging } from '../lib/geometry'
import { useSentinel, mergePersisted } from './index'
import { deriveWorld } from './selectors'

const state = () => useSentinel.getState()
const thread = (personId: string) => state().threads.find((t) => t.id === threadIdFor(personId))!
const person = (id: string) => state().world.people.find((p) => p.id === id)!

beforeEach(() => {
  localStorage.clear()
  state().resetDemo()
  state().setPerspective('firefighter')
})

describe('quick replies', () => {
  it('posts the chip and a status event, and raises priority', () => {
    const unreadBefore = thread('3B').unread
    state().sendQuickReply('3B', 'trapped')
    expect(person('3B')).toMatchObject({ status: 'trapped', priority: 'critical' })
    const last = thread('3B').messages.slice(-2)
    expect(last[0]).toMatchObject({ from: 'resident', quick: 'trapped', text: "I'm trapped", sender: 'Unit 3B' })
    expect(last[1]).toMatchObject({ from: 'system', text: 'Status changed to Trapped' })
    expect(thread('3B').unread).toBe(unreadBefore + 1)
  })

  it('makes the change visible to the firefighter view', () => {
    state().setPerspective('resident')
    state().sendQuickReply('3B', 'trapped')
    state().setPerspective('firefighter')
    const derived = deriveWorld(state().world)
    expect(derived.rescueRoutes.map((r) => r.personId)).toContain('3B')
  })

  it("moves a resident who is out to staging and drops their route", () => {
    state().sendQuickReply('3B', 'out')
    expect(isAtStaging(person('3B').pos)).toBe(true)
    expect(deriveWorld(state().world).exitRoutes['3B'].points).toHaveLength(0)
  })
})

describe('messages', () => {
  it('ignores blank messages and truncates long ones', () => {
    const before = thread('2D').messages.length
    state().sendMessage(threadIdFor('2D'), 'responder', '   ')
    expect(thread('2D').messages).toHaveLength(before)
    state().sendMessage(threadIdFor('2D'), 'responder', 'x'.repeat(600))
    const last = thread('2D').messages.at(-1)!
    expect(last.text).toHaveLength(500)
    expect(last.sender).toBe('E7 · Reyes')
  })

  it('shares one thread between perspectives', () => {
    state().setPerspective('resident')
    state().sendMessage(threadIdFor('3B'), 'resident', 'We are leaving now')
    state().setPerspective('firefighter')
    expect(thread('3B').messages.at(-1)).toMatchObject({ text: 'We are leaving now', sender: 'Unit 3B' })
  })

  it('clears a thread and still accepts a quick reply afterwards', () => {
    state().clearThread(threadIdFor('3B'))
    expect(thread('3B')).toMatchObject({ messages: [], unread: 0 })
    state().sendQuickReply('3B', 'cant-move')
    expect(thread('3B').messages).toHaveLength(2)
    expect(thread('3B').unread).toBe(1)
  })

  it('marks a thread read', () => {
    expect(thread('2D').unread).toBeGreaterThan(0)
    state().markRead(threadIdFor('2D'))
    expect(thread('2D').unread).toBe(0)
  })
})

describe('world edits', () => {
  it('posts a route event only when a route actually changes', () => {
    const count = () => thread('3B').messages.filter((m) => m.from === 'system').length
    const start = count()
    state().paintCell(3, 7, 4, 2) // blocks Stair A for 3B; 3B already uses B
    expect(count()).toBe(start)
    state().paintCell(3, 14, 4, 2) // blocks Stair B too
    expect(thread('3B').messages.at(-1)?.text).toBe('Route blocked · Shelter in place')
    state().paintCell(4, 0, 0, 2) // unrelated cell
    expect(count()).toBe(start + 1)
    state().paintCell(3, 14, 4, 0)
    expect(thread('3B').messages.at(-1)?.text).toBe('Route open · Take Stair B')
  })

  it('treats painting an unchanged cell as a no-op', () => {
    const world = state().world
    state().paintCell(1, 0, 0, 0)
    expect(state().world).toBe(world)
  })

  it('ignores drops outside the building and accepts hallway drops', () => {
    const before = person('3B').pos
    state().movePerson('3B', { floor: 1, x: 1100, y: 150 })
    expect(person('3B').pos).toEqual(before)
    state().movePerson('3B', { floor: 3, x: 500, y: 150 })
    expect(person('3B').pos).toEqual({ floor: 3, x: 500, y: 150 })
  })

  it('evacuates 2G through simulation steps', () => {
    for (let i = 0; i < 10; i++) state().stepSim()
    expect(person('2G').status).toBe('evacuated')
    expect(thread('2G').messages.at(-1)?.text).toBe('Status changed to Evacuated')
  })
})

describe('selection sync', () => {
  it('selecting a person selects their thread and reads it', () => {
    state().selectPerson('2D')
    expect(state().selectedThreadId).toBe(threadIdFor('2D'))
    expect(thread('2D').unread).toBe(0)
  })

  it('selecting a thread selects its person; crew clears it', () => {
    state().selectThread(threadIdFor('2B'))
    expect(state().selectedPersonId).toBe('2B')
    state().selectThread(CREW_THREAD_ID)
    expect(state().selectedPersonId).toBeNull()
  })
})

describe('reset and persistence', () => {
  it('resetDemo restores mock data but keeps the perspective', () => {
    state().sendQuickReply('3B', 'trapped')
    state().setPerspective('resident')
    state().resetDemo()
    expect(person('3B').status).toBe('sheltering')
    expect(state().perspective).toBe('resident')
  })

  it('falls back to current state when persisted data is corrupt', () => {
    const current = state()
    expect(mergePersisted(null, current)).toBe(current)
    expect(mergePersisted({ world: { people: 'nope' } }, current)).toBe(current)
    expect(mergePersisted({ incident: {}, world: {}, threads: [] }, current)).toBe(current)
  })

  it('rejects persisted people or threads from an older shape', () => {
    const current = state()
    const clone = () => JSON.parse(JSON.stringify(createMockState(1)))
    const noMobility = clone()
    delete noMobility.world.people[0].mobility
    expect(mergePersisted(noMobility, current)).toBe(current)
    const noUnread = clone()
    delete noUnread.threads[0].unread
    expect(mergePersisted(noUnread, current)).toBe(current)
  })

  it('uses valid persisted data', () => {
    const saved = createMockState(123)
    const merged = mergePersisted(JSON.parse(JSON.stringify(saved)), state())
    expect(merged.incident.startedAt).toBe(saved.incident.startedAt)
    expect(merged.world.people).toHaveLength(8)
  })
})
