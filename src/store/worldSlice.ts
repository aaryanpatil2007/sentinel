import type { Floor, HazardValue, Message, Person, Point, World } from '../types'
import { isInsideBuilding } from '../lib/geometry'
import { withCell } from '../lib/grid'
import { stepPeople } from '../lib/movement'
import { appendMessages, routeChangeMessages, statusMessage } from './events'
import type { SliceCreator } from './types'

export type WorldSlice = {
  world: World
  /** Single entry point for world changes: stores the world and posts system events. */
  commitWorld: (next: World, messages?: Message[]) => void
  movePerson: (id: string, pos: Point) => void
  paintCell: (floor: Floor, col: number, row: number, value: HazardValue) => void
  stepSim: () => void
}

export const createWorldSlice =
  (initial: World): SliceCreator<WorldSlice> =>
  (set, get) => ({
    world: initial,

    commitWorld: (next, messages = []) => {
      const now = Date.now()
      set((s) => ({
        world: next,
        worldUpdatedAt: now,
        threads: appendMessages(s.threads, [...messages, ...routeChangeMessages(s.world, next, now)]),
      }))
    },

    movePerson: (id, pos) => {
      if (!isInsideBuilding(pos)) return
      const { world, commitWorld } = get()
      const person = world.people.find((p) => p.id === id)
      if (!person) return
      const now = Date.now()
      const wasOut = person.status === 'evacuated'
      const moved: Person = wasOut
        ? { ...person, pos, status: 'unknown', priority: 'moderate', lastUpdate: now }
        : { ...person, pos, lastUpdate: now }
      commitWorld(
        { ...world, people: world.people.map((p) => (p.id === id ? moved : p)) },
        wasOut ? [statusMessage(id, 'unknown', now)] : [],
      )
    },

    paintCell: (floor, col, row, value) => {
      const { world, commitWorld } = get()
      const hazards = withCell(world.hazards, floor, col, row, value)
      if (hazards === world.hazards) return
      commitWorld({ ...world, hazards })
    },

    stepSim: () => {
      const { world, commitWorld } = get()
      const now = Date.now()
      const people = stepPeople(world, now)
      const messages = people
        .filter((p, i) => p.status !== world.people[i].status)
        .map((p) => statusMessage(p.id, p.status, now))
      commitWorld({ ...world, people }, messages)
    },
  })
