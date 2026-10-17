import type { Brush, GoStay, OverlayKind, Perspective, ResidentView } from '../types'
import { CREW_THREAD_ID, DEFAULT_RESIDENT_ID, threadIdFor } from '../data/mock'
import type { SliceCreator } from './types'

export type UiData = {
  perspective: Perspective
  viewingAsId: string
  selectedPersonId: string | null
  hoveredPersonId: string | null
  selectedThreadId: string
  overlays: Record<OverlayKind, boolean>
  simMode: boolean
  brush: Brush
  residentView: ResidentView
  devGoStay: GoStay
  expandedCameraId: string | null
  worldUpdatedAt: number
  composerFocusNonce: number
}

export type UiActions = {
  setPerspective: (perspective: Perspective) => void
  setViewingAs: (personId: string) => void
  selectPerson: (personId: string | null) => void
  hoverPerson: (personId: string | null) => void
  selectThread: (threadId: string) => void
  toggleOverlay: (kind: OverlayKind) => void
  setSimMode: (on: boolean) => void
  setBrush: (brush: Brush) => void
  setResidentView: (view: ResidentView) => void
  setDevGoStay: (value: GoStay) => void
  setExpandedCamera: (cameraId: string | null) => void
  requestComposerFocus: () => void
}

export type UiSlice = UiData & UiActions

export function initialUi(now: number, perspective: Perspective = 'firefighter'): UiData {
  return {
    perspective,
    viewingAsId: DEFAULT_RESIDENT_ID,
    selectedPersonId: null,
    hoveredPersonId: null,
    selectedThreadId: CREW_THREAD_ID,
    overlays: { fire: true, smoke: true, structural: true },
    simMode: false,
    brush: 'fire',
    residentView: 'building',
    devGoStay: 'auto',
    expandedCameraId: null,
    worldUpdatedAt: now,
    composerFocusNonce: 0,
  }
}

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  ...initialUi(Date.now()),
  setPerspective: (perspective) => set({ perspective }),
  setViewingAs: (viewingAsId) => set({ viewingAsId }),
  selectPerson: (personId) => {
    if (personId === null) {
      set({ selectedPersonId: null })
      return
    }
    const threadId = threadIdFor(personId)
    set({ selectedPersonId: personId, selectedThreadId: threadId })
    get().markRead(threadId)
  },
  hoverPerson: (hoveredPersonId) => set({ hoveredPersonId }),
  selectThread: (threadId) => {
    const thread = get().threads.find((t) => t.id === threadId)
    if (!thread) return
    set({ selectedThreadId: threadId, selectedPersonId: thread.personId ?? null })
    get().markRead(threadId)
  },
  toggleOverlay: (kind) => set((s) => ({ overlays: { ...s.overlays, [kind]: !s.overlays[kind] } })),
  setSimMode: (simMode) => set({ simMode }),
  setBrush: (brush) => set({ brush }),
  setResidentView: (residentView) => set({ residentView }),
  setDevGoStay: (devGoStay) => set({ devGoStay }),
  setExpandedCamera: (expandedCameraId) => set({ expandedCameraId }),
  requestComposerFocus: () => set((s) => ({ composerFocusNonce: s.composerFocusNonce + 1 })),
})
