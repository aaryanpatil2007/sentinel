import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { createMockState, type MockState } from '../data/mock'
import { GRID_COLS, GRID_ROWS } from '../lib/grid'
import { createCommsSlice } from './commsSlice'
import type { SentinelState } from './types'
import { createUiSlice, initialUi } from './uiSlice'
import { createWorldSlice } from './worldSlice'

export type { SentinelState } from './types'

export const STORE_KEY = 'sentinel-demo'
export const STORE_VERSION = 1

type PersistedState = MockState

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function isValidPerson(p: unknown): boolean {
  if (!isObject(p) || !isObject(p.pos)) return false
  const { floor, x, y } = p.pos
  return (
    typeof p.id === 'string' &&
    typeof p.unit === 'string' &&
    typeof p.status === 'string' &&
    typeof p.priority === 'string' &&
    Array.isArray(p.mobility) &&
    isNum(floor) &&
    isNum(x) &&
    isNum(y)
  )
}

function isValidMessage(m: unknown): boolean {
  return isObject(m) && typeof m.from === 'string' && typeof m.text === 'string' && isNum(m.at)
}

function isValidThread(t: unknown): boolean {
  return isObject(t) && typeof t.id === 'string' && isNum(t.unread) && Array.isArray(t.messages) && t.messages.every(isValidMessage)
}

export function isValidPersisted(value: unknown): value is PersistedState {
  if (!isObject(value) || !isObject(value.incident) || !isObject(value.world) || !Array.isArray(value.threads)) return false
  if (typeof value.incident.startedAt !== 'number') return false
  const { people, hazards, structural } = value.world
  if (!Array.isArray(people) || !Array.isArray(structural) || !isObject(hazards)) return false
  const gridOk = [1, 2, 3, 4].every((f) => Array.isArray(hazards[f]) && (hazards[f] as unknown[]).length === GRID_COLS * GRID_ROWS)
  const peopleOk = people.every(isValidPerson)
  const threadsOk = value.threads.every(isValidThread)
  return gridOk && peopleOk && threadsOk
}

export function mergePersisted(persisted: unknown, current: SentinelState): SentinelState {
  if (!isValidPersisted(persisted)) return current
  return { ...current, incident: persisted.incident, world: persisted.world, threads: persisted.threads }
}

const initial = createMockState()

export const useSentinel = create<SentinelState>()(
  persist(
    (set, get, api) => ({
      incident: initial.incident,
      ...createWorldSlice(initial.world)(set, get, api),
      ...createCommsSlice(initial.threads)(set, get, api),
      ...createUiSlice(set, get, api),
      resetDemo: () => {
        const fresh = createMockState()
        set({ ...fresh, ...initialUi(Date.now(), get().perspective) })
      },
    }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PersistedState => ({ incident: s.incident, world: s.world, threads: s.threads }),
      merge: (persisted, current) => mergePersisted(persisted, current),
      migrate: () => createMockState(),
    },
  ),
)
