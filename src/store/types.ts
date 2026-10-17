import type { StateCreator } from 'zustand'
import type { CommsSlice } from './commsSlice'
import type { EngineSlice } from './engineSlice'
import type { UiSlice } from './uiSlice'

export type SentinelState = EngineSlice &
  CommsSlice &
  UiSlice & {
    resetDemo: () => Promise<void>
  }

export type SliceCreator<T> = StateCreator<SentinelState, [['zustand/persist', unknown]], [], T>
