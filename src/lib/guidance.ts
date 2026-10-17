/** Stub guidance. Turns a route into at most 4 plain-language lines. Replace freely. */
import type { Floor, HazardGrid, HazardValue, Instruction, InstructionMode, Person, Route, World } from '../types'
import { STAIRS, doorFor, unitAt } from './geometry'
import { maxHazardAlong } from './grid'

const ALL_FLOORS: Floor[] = [1, 2, 3, 4]

export function fireFloors(world: World): Floor[] {
  return ALL_FLOORS.filter((f) => world.hazards[f].some((v) => v === 2))
}

function joinFloors(floors: Floor[]): string {
  if (floors.length <= 1) return String(floors[0] ?? '')
  return `${floors.slice(0, -1).join(', ')} and ${floors[floors.length - 1]}`
}

export function turnDirection(person: Person, route: Route): 'LEFT' | 'RIGHT' | null {
  if (!route.via) return null
  return STAIRS[route.via].entry.x >= doorFor(person.pos).x ? 'RIGHT' : 'LEFT'
}

/** Worst hazard along the route on the person's own floor, from their doorway on. */
export function hallwayHazard(person: Person, route: Route, grid: HazardGrid): HazardValue {
  const pts = route.points
  let max: HazardValue = 0
  for (let i = unitAt(person.pos) ? 2 : 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.floor !== person.pos.floor || b.floor !== person.pos.floor) break
    const v = maxHazardAlong(grid, a.floor, a, b)
    if (v > max) max = v
  }
  return max
}

export function instructionMode(person: Person, route: Route): InstructionMode {
  if (person.status === 'evacuated' || (route.via === null && !route.blocked)) return 'out'
  return route.blocked ? 'stay' : 'go'
}

export function instructionsFor(person: Person, route: Route, world: World): Instruction[] {
  const mode = instructionMode(person, route)
  if (mode === 'out') {
    return [
      { text: 'You are out of the building.', tone: 'go' },
      { text: 'Stay at the staging area by EXIT B.', tone: 'info' },
      { text: 'Tell a responder if anyone is missing.', tone: 'info' },
    ]
  }
  if (mode === 'stay') {
    return [
      { text: 'Both stairs are blocked.', tone: 'stay' },
      { text: 'Close your door. Seal gaps with towels.', tone: 'stay' },
      { text: 'Go to a window and signal.', tone: 'stay' },
      { text: `Responders know you are in ${person.unit}.`, tone: 'info' },
    ]
  }
  const fires = fireFloors(world)
  const clear = hallwayHazard(person, route, world.hazards) === 0
  const dir = turnDirection(person, route)
  return [
    { text: fires.length ? `Fire on floor ${joinFloors(fires)}.` : 'No fire reported near you.', tone: 'info' },
    { text: clear ? 'Your hallway is clear.' : 'Smoke in your hallway. Stay low.', tone: clear ? 'go' : 'info' },
    {
      text: person.pos.floor === 1 ? `Turn ${dir}, go to EXIT ${route.via}.` : `Turn ${dir}, take STAIR ${route.via} down.`,
      tone: 'go',
    },
    { text: 'Do not use the elevator.', tone: 'info' },
  ]
}
