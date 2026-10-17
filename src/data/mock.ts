import type { HazardGrid, Incident, MessageFrom, Person, QuickReply, Region, Thread, World } from '../types'
import { stagingSpot, unitCenter } from '../lib/geometry'
import { emptyGrid, fillCells } from '../lib/grid'
import { QUICK_REPLY_LABEL, RESPONDER_SENDER, SYSTEM_SENDER, residentSender } from '../lib/labels'

export const DEFAULT_RESIDENT_ID = '3B'
export const CREW_THREAD_ID = 'crew'
export const threadIdFor = (personId: string) => `thread-${personId}`

export type MockState = { incident: Incident; world: World; threads: Thread[] }

const MIN = 60_000

function mockHazards(): HazardGrid {
  let grid = emptyGrid()
  grid = fillCells(grid, 2, [8, 21], [3, 5], 1) // smoke along the floor 2 hallway
  grid = fillCells(grid, 2, [10, 21], [0, 2], 1) // smoke in east units
  grid = fillCells(grid, 2, [12, 20], [0, 2], 2) // fire in 2C and 2D
  grid = fillCells(grid, 2, [13, 16], [3, 4], 2) // fire spilling into the hallway
  grid = fillCells(grid, 3, [17, 21], [0, 2], 1) // smoke reaching 3D
  return grid
}

const STRUCTURAL: Region[] = [{ floor: 2, x: 40, y: 110, w: 110, h: 80 }]

function mockPeople(now: number): Person[] {
  return [
    { id: '2D', unit: '2D', pos: unitCenter('2D'), count: 3, priority: 'critical', status: 'trapped', mobility: ['Infant'], lastUpdate: now - 1 * MIN },
    { id: '2B', unit: '2B', pos: unitCenter('2B'), count: 1, priority: 'critical', status: 'immobile', mobility: ['Wheelchair'], lastUpdate: now - 3 * MIN },
    { id: '3B', unit: '3B', pos: unitCenter('3B'), count: 2, priority: 'moderate', status: 'sheltering', mobility: [], lastUpdate: now - 2 * MIN },
    { id: '3F', unit: '3F', pos: unitCenter('3F'), count: 1, priority: 'moderate', status: 'unknown', mobility: ['Elderly'], lastUpdate: now - 6 * MIN },
    { id: '2G', unit: '2G', pos: { floor: 2, x: 760, y: 150 }, count: 2, priority: 'moderate', status: 'evacuating', mobility: [], lastUpdate: now - 1 * MIN },
    { id: '4A', unit: '4A', pos: unitCenter('4A'), count: 4, priority: 'moderate', status: 'sheltering', mobility: ['Child'], lastUpdate: now - 4 * MIN },
    { id: '1C', unit: '1C', pos: stagingSpot(0), count: 2, priority: 'safe', status: 'evacuated', mobility: [], lastUpdate: now - 9 * MIN },
    { id: '4E', unit: '4E', pos: stagingSpot(1), count: 1, priority: 'safe', status: 'evacuated', mobility: [], lastUpdate: now - 7 * MIN },
  ]
}

type LineOptions = { quick?: QuickReply; sender?: string }
type Line = [from: MessageFrom, text: string, minutesAgo: number, options?: LineOptions]

function defaultSender(from: MessageFrom, unit: string | undefined): string {
  if (from === 'system') return SYSTEM_SENDER
  if (from === 'responder') return RESPONDER_SENDER
  return residentSender(unit ?? '')
}

function buildThread(id: string, personId: string | undefined, lines: Line[], now: number, unread = 0): Thread {
  return {
    id,
    kind: personId ? 'resident' : 'crew',
    personId,
    unread,
    messages: lines.map(([from, text, ago, options = {}], i) => ({
      id: `${id}-${i}`,
      threadId: id,
      from,
      sender: options.sender ?? defaultSender(from, personId),
      text: options.quick ? QUICK_REPLY_LABEL[options.quick] : text,
      quick: options.quick,
      at: now - ago * MIN,
    })),
  }
}

const CREW: Line[] = [
  ['responder', 'E7 on scene. Working fire, floor 2, east side. Establishing command at Exit B.', 14, { sender: 'E7 · Reyes' }],
  ['responder', 'L3 on scene. Setting up aerial on the east face.', 13, { sender: 'L3 · Okafor' }],
  ['responder', 'BC2 has command. E7 take fire attack via Stair B. L3 primary search floors 3 and 4.', 12, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Copy. Line going up Stair B.', 11, { sender: 'E7 · Reyes' }],
  ['responder', 'Structural risk reported at the floor 2 Stair A landing. Avoid unless needed.', 9, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Smoke reaching floor 3 east units. Visibility poor near 3D.', 8, { sender: 'L3 · Okafor' }],
  ['responder', '2G pair evacuating via Stair B, we passed them on the landing.', 6, { sender: 'E7 · Reyes' }],
  ['responder', '2D reports three trapped including an infant. Next priority.', 4, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Primary search floor 4 west complete. 4A sheltering, 4 occupants, stable.', 3, { sender: 'L3 · Okafor' }],
  ['responder', 'E12 arriving. Assigning to 2B, wheelchair user, via Stair A.', 2, { sender: 'BC2 · Lindqvist' }],
]

const RESIDENT_LINES: Record<string, { lines: Line[]; unread: number }> = {
  '2D': {
    unread: 2,
    lines: [
      ['resident', 'There is smoke coming under our door. We are in 2D.', 13],
      ['responder', 'We see you in 2D. Keep the door closed and put wet towels along the bottom.', 12],
      ['resident', '', 11, { quick: 'trapped' }],
      ['system', 'Status changed to Trapped', 11],
      ['resident', '3 of us. My daughter is 8 months old.', 10],
      ['responder', 'Engine 7 is coming up Stair B to you. Stay low, near the window.', 8],
      ['resident', 'The hallway is too hot to open the door.', 3],
      ['resident', 'Please hurry', 1],
    ],
  },
  '2B': {
    unread: 1,
    lines: [
      ['resident', 'I use a wheelchair and cannot take the stairs. Unit 2B.', 12],
      ['responder', 'Understood. Stay in your unit with the door closed. A crew is assigned to you.', 11],
      ['resident', '', 10, { quick: 'cant-move' }],
      ['system', "Status changed to Can't move", 10],
      ['responder', 'Is anyone with you?', 7],
      ['resident', 'No, just me. Smoke is light in here.', 6],
      ['resident', 'Phone is at 20 percent', 3],
    ],
  },
  '3B': {
    unread: 0,
    lines: [
      ['system', 'Route ready · Take Stair B', 13],
      ['resident', 'We smell smoke. Should we leave?', 12],
      ['responder', 'Your hallway is clear right now. Follow the route on your screen to Stair B.', 11],
      ['resident', 'There are two of us. Is the elevator safe?', 10],
      ['responder', 'Do not use the elevator. Take Stair B down to Exit B.', 10],
      ['resident', 'Okay, getting shoes on.', 3],
      ['responder', 'Take a wet cloth for your face. We will meet you outside Exit B.', 2],
    ],
  },
  '3F': {
    unread: 0,
    lines: [
      ['system', 'Alert sent to unit 3F', 13],
      ['responder', 'This is the fire department. Reply if you are in unit 3F.', 11],
      ['system', 'No reply after 5 minutes', 6],
      ['responder', 'If you can hear this, tap a reply button or call 911.', 6],
      ['responder', 'Neighbor in 3G says an elderly man lives here alone.', 5, { sender: 'L3 · Okafor' }],
      ['system', 'Search requested · L3', 4],
    ],
  },
  '2G': {
    unread: 0,
    lines: [
      ['resident', 'We are in 2G, two adults. Leaving now.', 9],
      ['responder', 'Go east to Stair B. Do not go past the elevator.', 9],
      ['resident', 'Hallway is smoky on the right side.', 7],
      ['responder', 'Stay low and keep to the wall. Stair B is 6 meters ahead of you.', 7],
      ['system', 'Route updated · Stair A → Stair B', 7],
      ['resident', 'In the stairwell now.', 1],
      ['responder', 'Good. Keep going down to Exit B.', 1],
    ],
  },
  '4A': {
    unread: 1,
    lines: [
      ['resident', '4A here, four of us including my son. No smoke on this floor.', 11],
      ['responder', 'Stay inside for now. Keep the door shut. We will update you.', 10],
      ['resident', 'Should we go to the roof?', 8],
      ['responder', 'No. Stay in your unit. Ladder 3 is searching your floor.', 8],
      ['system', 'Status changed to Sheltering', 8],
      ['responder', 'Firefighters checked your floor. You are safe where you are.', 3],
      ['resident', 'Thank you. We can hear sirens.', 2],
    ],
  },
  '1C': {
    unread: 0,
    lines: [
      ['resident', 'We were in 1C. We are outside.', 12],
      ['resident', '', 12, { quick: 'out' }],
      ['system', 'Status changed to Evacuated', 12],
      ['responder', 'Thank you. Please stay at the staging area by Exit B.', 11],
      ['resident', 'Our neighbor in 1D is away this week.', 10],
      ['responder', 'Noted, thank you.', 9],
    ],
  },
  '4E': {
    unread: 0,
    lines: [
      ['resident', '4E, got out by Stair A before the smoke.', 10],
      ['resident', '', 9, { quick: 'out' }],
      ['system', 'Status changed to Evacuated', 9],
      ['responder', 'Glad you are out. Check in at the staging area.', 8],
      ['resident', 'I am with the EMTs now.', 7],
      ['responder', 'Stay with them. We will find you if we need you.', 7],
    ],
  },
}

export function createMockState(now: number = Date.now()): MockState {
  const people = mockPeople(now)
  const residentThreads = people.map((p) => {
    const { lines, unread } = RESIDENT_LINES[p.id]
    return buildThread(threadIdFor(p.id), p.id, lines, now, unread)
  })
  return {
    incident: { name: 'Maple Court Apartments', address: '1420 Alder St', startedAt: now - 14 * MIN },
    world: { people, hazards: mockHazards(), structural: STRUCTURAL },
    threads: [buildThread(CREW_THREAD_ID, undefined, CREW, now), ...residentThreads],
  }
}
