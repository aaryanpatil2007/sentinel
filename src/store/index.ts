import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Perspective, Thread } from '../types'
import { DEFAULT_RESIDENT_ID, seedThreads } from '../data/scenarioThreads'
import { createCommsSlice } from './commsSlice'
import { createEngineSlice } from './engineSlice'
import type { SentinelState } from './types'
import { createUiSlice, initialUi } from './uiSlice'

export type { SentinelState } from './types'

export const STORE_KEY = 'sentinel-jacobs'
export const STORE_VERSION = 2

type PersistedState = { threads: Thread[]; perspective: Perspective; viewingAsId: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const PERSPECTIVES: readonly unknown[] = ['firefighter', 'resident']

function isValidMessage(m: unknown): boolean {
  return isObject(m) && typeof m.id === 'string' && typeof m.from === 'string' && typeof m.sender === 'string' && typeof m.text === 'string' && typeof m.at === 'number'
}

function isValidThread(t: unknown): boolean {
  return isObject(t) && typeof t.id === 'string' && typeof t.unread === 'number' && Array.isArray(t.messages) && t.messages.every(isValidMessage)
}

export function isValidPersisted(value: unknown): value is PersistedState {
  return (
    isObject(value) &&
    Array.isArray(value.threads) &&
    value.threads.every(isValidThread) &&
    PERSPECTIVES.includes(value.perspective) &&
    typeof value.viewingAsId === 'string'
  )
}

export function mergePersisted(persisted: unknown, current: SentinelState): SentinelState {
  if (!isValidPersisted(persisted)) return current
  return { ...current, threads: persisted.threads, perspective: persisted.perspective, viewingAsId: persisted.viewingAsId }
}

const freshPersisted = (): PersistedState => ({ threads: seedThreads(Date.now()), perspective: 'firefighter', viewingAsId: DEFAULT_RESIDENT_ID })

export const useSentinel = create<SentinelState>()(
  persist(
    (set, get, api) => ({
      ...createEngineSlice(set, get, api),
      ...createCommsSlice(seedThreads(Date.now()))(set, get, api),
      ...createUiSlice(set, get, api),
      resetDemo: async () => {
        set({ threads: seedThreads(Date.now()), ...initialUi(get().perspective, get().viewingAsId) })
        await get().resetIncident()
      },
    }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PersistedState => ({ threads: s.threads, perspective: s.perspective, viewingAsId: s.viewingAsId }),
      merge: (persisted, current) => mergePersisted(persisted, current),
      migrate: () => freshPersisted(),
    },
  ),
)
