import type { Person, QuickReply, World } from '../types'
import { stagingSpot } from '../lib/geometry'

export function applyQuickReply(person: Person, reply: QuickReply, world: World, now: number): Person {
  switch (reply) {
    case 'trapped':
      return { ...person, status: 'trapped', priority: 'critical', lastUpdate: now }
    case 'cant-move':
      return {
        ...person,
        status: 'immobile',
        priority: 'critical',
        mobility: person.mobility.includes('Immobile') ? person.mobility : [...person.mobility, 'Immobile'],
        lastUpdate: now,
      }
    case 'out': {
      if (person.status === 'evacuated') return { ...person, lastUpdate: now }
      const spot = stagingSpot(world.people.filter((p) => p.status === 'evacuated').length)
      return { ...person, status: 'evacuated', priority: 'safe', pos: spot, lastUpdate: now }
    }
  }
}
