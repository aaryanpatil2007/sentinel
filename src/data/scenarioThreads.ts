import type { MessageFrom, QuickReply, Thread } from '../types'
import { QUICK_REPLY_LABEL, RESPONDER_SENDER, SYSTEM_SENDER } from '../lib/labels'
import scenario from './scenario.json'

export const CREW_THREAD_ID = 'crew'
export const DEFAULT_RESIDENT_ID = scenario.defaultResidentId
export const threadIdFor = (civilianId: string) => `thread-${civilianId}`

export type CameraSpec = { id: string; label: string; nodeId: string; status: 'live' | 'no-signal' }

export const CAMERAS: CameraSpec[] = [
  { id: 'CAM_F2_EAST', label: 'F2 east corridor', nodeId: 'F2_CORRIDOR_EAST', status: 'live' },
  { id: 'CAM_F3_WEST', label: 'F3 west stair', nodeId: 'F3_STAIR_A', status: 'live' },
  { id: 'CAM_F1_LOBBY', label: 'Main lobby', nodeId: 'F1_CORRIDOR_CENTER', status: 'live' },
  { id: 'CAM_B_EAST', label: 'Basement east', nodeId: 'B_CORRIDOR_EAST', status: 'no-signal' },
]

const MIN = 60_000

type LineOptions = { quick?: QuickReply; sender?: string }
type Line = [from: MessageFrom, text: string, minutesAgo: number, options?: LineOptions]

/** Sender shown for each scenario resident, matching the room the engine resolves. */
const RESIDENT_PLACES = ['Studio 210', 'Metal Shop', 'Studio 310', 'Advanced Prototyping Lab', 'Studio 110', 'Studio 120']

const CREW: Line[] = [
  ['responder', 'E7 on scene at Jacobs Hall. Smoke showing from the second floor, east side.', 14, { sender: 'E7 · Reyes' }],
  ['responder', 'BC2 has command. Staging on Ridge Road at the main entrance.', 13, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Alpha, interior search via the east stair. Bravo, west stair.', 12, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Copy. Alpha entering with two.', 11, { sender: 'E7 · Reyes' }],
  ['responder', 'Fire confirmed in the F2 east corridor. Doors to 220 are hot.', 9, { sender: 'L3 · Okafor' }],
  ['responder', 'Smoke layering on F3 center corridor. Visibility under 3 meters.', 8, { sender: 'L3 · Okafor' }],
  ['responder', 'Three reported trapped in the metal shop, basement. Alpha, that is yours.', 6, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Bravo heading for Studio 210, one non-ambulatory.', 4, { sender: 'E7 · Reyes' }],
  ['responder', 'Studio 110 occupant self-evacuating through the lobby.', 3, { sender: 'L3 · Okafor' }],
  ['responder', 'Engine is predicting spread toward the F2 west corridor. Watch the west stair.', 2, { sender: 'BC2 · Lindqvist' }],
]

const RESIDENTS: { lines: Line[]; unread: number }[] = [
  {
    unread: 2,
    lines: [
      ['resident', scenario.residents[0].text, 13],
      ['responder', 'We have you in Studio 210. Keep the door closed and stay low.', 12],
      ['resident', 'My friend broke her ankle this morning. She cannot do stairs.', 11],
      ['system', "Status changed to Can't move", 11],
      ['responder', 'Understood. A crew is coming to carry her down the west stair.', 9],
      ['resident', 'Smoke is getting thicker by the door.', 4],
      ['resident', 'Please hurry', 2],
    ],
  },
  {
    unread: 1,
    lines: [
      ['resident', scenario.residents[1].text, 13],
      ['responder', 'Stay in the metal shop. Do not open the hallway door.', 12],
      ['resident', '', 11, { quick: 'trapped' }],
      ['system', 'Status changed to Trapped', 11],
      ['resident', 'There are three of us. One is coughing a lot.', 9],
      ['responder', 'Alpha is coming down the east stair to you now.', 6],
      ['resident', 'We can hear something in the stairwell.', 2],
    ],
  },
  {
    unread: 0,
    lines: [
      ['resident', scenario.residents[2].text, 12],
      ['responder', 'The west stair is clear right now. Follow the route on your screen.', 11],
      ['resident', 'Is the elevator safe to use?', 10],
      ['responder', 'Do not use the elevator. Take the west stair all the way down.', 10],
      ['system', 'Route ready · Exit via Main Entrance', 9],
      ['resident', 'Okay, putting shoes on.', 3],
      ['responder', 'Cover your mouth with a cloth. We will meet you at the main entrance.', 2],
    ],
  },
  {
    unread: 1,
    lines: [
      ['resident', scenario.residents[3].text, 12],
      ['responder', 'Which door are you near?', 11],
      ['resident', 'The one by the resin printers. The hallway is full of smoke.', 10],
      ['responder', 'Stay put and seal the door gap. A crew is assigned.', 9],
      ['resident', '', 7, { quick: 'trapped' }],
      ['system', 'Status changed to Trapped', 7],
      ['resident', 'We are by the window on the north side.', 3],
    ],
  },
  {
    unread: 0,
    lines: [
      ['resident', scenario.residents[4].text, 10],
      ['responder', 'Your route is clear. Leave through the main entrance now.', 9],
      ['resident', 'Going now.', 8],
      ['responder', 'Do not stop for belongings.', 8],
      ['resident', 'I am in the lobby.', 4],
      ['responder', 'Good. Keep going to the staging area on Ridge Road.', 3],
    ],
  },
  {
    unread: 0,
    lines: [
      ['resident', scenario.residents[5].text, 11],
      ['responder', 'You are on the first floor. Can you reach the east entrance?', 10],
      ['resident', 'The ramp by the east entrance is open.', 9],
      ['responder', 'Head for the east entrance. Firefighters are outside.', 8],
      ['resident', 'Moving now, slowly.', 5],
      ['responder', 'Take your time. The east corridor is clear.', 4],
    ],
  },
]

function buildThread(id: string, personId: string | undefined, place: string | undefined, lines: Line[], now: number, unread: number): Thread {
  return {
    id,
    kind: personId ? 'resident' : 'crew',
    personId,
    unread,
    messages: lines.map(([from, text, ago, options = {}], i) => ({
      id: `${id}-${i}`,
      threadId: id,
      from,
      sender: options.sender ?? (from === 'system' ? SYSTEM_SENDER : from === 'responder' ? RESPONDER_SENDER : place ?? 'Resident'),
      text: options.quick ? QUICK_REPLY_LABEL[options.quick] : text,
      quick: options.quick,
      at: now - ago * MIN,
    })),
  }
}

/** Seeded conversations. Civilian ids follow scenario order on a freshly seeded engine (CIV_001…). */
export function seedThreads(now: number): Thread[] {
  const residents = RESIDENTS.map(({ lines, unread }, i) => {
    const civilianId = `CIV_00${i + 1}`
    return buildThread(threadIdFor(civilianId), civilianId, RESIDENT_PLACES[i], lines, now, unread)
  })
  return [buildThread(CREW_THREAD_ID, undefined, undefined, CREW, now, 0), ...residents]
}
