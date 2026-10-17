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

export function isValidPersisted(value: unknown): value is PersistedState {
  if (!isObject(value) || !isObject(value.incident) || !isObject(value.world) || !Array.isArray(value.threads)) return false
  if (typeof value.incident.startedAt !== 'number') return false
  const { people, hazards, structural } = value.world
  if (!Array.isArray(people) || !Array.isArray(structural) || !isObject(hazards)) return false
  const gridOk = [1, 2, 3, 4].every((f) => Array.isArray(hazards[f]) && (hazards[f] as unknown[]).length === GRID_COLS * GRID_ROWS)
  const peopleOk = people.every((p) => isObject(p) && typeof p.id === 'string' && isObject(p.pos))
  const threadsOk = value.threads.every((t) => isObject(t) && typeof t.id === 'string' && Array.isArray(t.messages))
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
