import type { FloorFilter, GoStay, OverlayKind, Perspective, ResidentView, SimTool } from '../types'
import { CREW_THREAD_ID, DEFAULT_RESIDENT_ID, threadIdFor } from '../data/scenarioThreads'
import type { SliceCreator } from './types'

export type UiData = {
  perspective: Perspective
  viewingAsId: string
  selectedCivilianId: string | null
  hoveredCivilianId: string | null
  selectedThreadId: string
  overlays: Record<OverlayKind, boolean>
  floor: FloorFilter
  simMode: boolean
  simTool: SimTool
  moveSourceId: string | null
  residentView: ResidentView
  devGoStay: GoStay
  expandedCameraId: string | null
  composerFocusNonce: number
}

export type UiActions = {
  setPerspective: (perspective: Perspective) => void
  setViewingAs: (civilianId: string) => void
  selectCivilian: (civilianId: string | null) => void
  hoverCivilian: (civilianId: string | null) => void
  selectThread: (threadId: string) => void
  toggleOverlay: (kind: OverlayKind) => void
  setFloor: (floor: FloorFilter) => void
  setSimMode: (on: boolean) => void
  setSimTool: (tool: SimTool) => void
  setMoveSource: (civilianId: string | null) => void
  setResidentView: (view: ResidentView) => void
  setDevGoStay: (value: GoStay) => void
  setExpandedCamera: (cameraId: string | null) => void
  requestComposerFocus: () => void
}

export type UiSlice = UiData & UiActions

export function initialUi(perspective: Perspective = 'firefighter', viewingAsId: string = DEFAULT_RESIDENT_ID): UiData {
  return {
    perspective,
    viewingAsId,
    selectedCivilianId: null,
    hoveredCivilianId: null,
    selectedThreadId: CREW_THREAD_ID,
    overlays: { fire: true, smoke: true, risk: true },
    floor: 'all',
    simMode: false,
    simTool: 'fire',
    moveSourceId: null,
    residentView: 'building',
    devGoStay: 'auto',
    expandedCameraId: null,
    composerFocusNonce: 0,
  }
}

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  ...initialUi(),
  setPerspective: (perspective) => set({ perspective }),
  setViewingAs: (viewingAsId) => {
    set({ viewingAsId })
    if (get().engineStatus === 'live') void get().refreshSafely()
  },
  selectCivilian: (civilianId) => {
    if (civilianId === null) {
      set({ selectedCivilianId: null })
      return
    }
    const threadId = threadIdFor(civilianId)
    set({ selectedCivilianId: civilianId, selectedThreadId: threadId })
    get().markRead(threadId)
  },
  hoverCivilian: (hoveredCivilianId) => set({ hoveredCivilianId }),
  selectThread: (threadId) => {
    const thread = get().threads.find((t) => t.id === threadId)
    if (!thread) return
    set({ selectedThreadId: threadId, selectedCivilianId: thread.personId ?? null })
    get().markRead(threadId)
  },
  toggleOverlay: (kind) => set((s) => ({ overlays: { ...s.overlays, [kind]: !s.overlays[kind] } })),
  setFloor: (floor) => set({ floor }),
  setSimMode: (simMode) => set({ simMode, moveSourceId: null }),
  setSimTool: (simTool) => set({ simTool, moveSourceId: null }),
  setMoveSource: (moveSourceId) => set({ moveSourceId }),
  setResidentView: (residentView) => set({ residentView }),
  setDevGoStay: (devGoStay) => set({ devGoStay }),
  setExpandedCamera: (expandedCameraId) => set({ expandedCameraId }),
  requestComposerFocus: () => set((s) => ({ composerFocusNonce: s.composerFocusNonce + 1 })),
})
