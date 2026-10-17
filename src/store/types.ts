import type { StateCreator } from 'zustand'
import type { Incident } from '../types'
import type { CommsSlice } from './commsSlice'
import type { UiSlice } from './uiSlice'
import type { WorldSlice } from './worldSlice'

export type SentinelState = WorldSlice &
  CommsSlice &
  UiSlice & {
    incident: Incident
    resetDemo: () => void
  }

export type SliceCreator<T> = StateCreator<SentinelState, [['zustand/persist', unknown]], [], T>
