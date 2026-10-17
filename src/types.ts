import type { FloorId } from './engine/types'

/** Marker tone: critical (error), moderate (warning), safe (success). */
export type Priority = 'critical' | 'moderate' | 'safe'
export type Instruction = { text: string; tone: 'go' | 'stay' | 'info' }
export type InstructionMode = 'go' | 'stay' | 'out'

export type QuickReply = 'out' | 'trapped' | 'cant-move'
export type MessageFrom = 'resident' | 'responder' | 'system'
export type Message = {
  id: string
  threadId: string
  from: MessageFrom
  sender: string
  text: string
  quick?: QuickReply
  at: number
}
export type Thread = { id: string; kind: 'crew' | 'resident'; personId?: string; messages: Message[]; unread: number }

export type Perspective = 'firefighter' | 'resident'
export type GoStay = 'auto' | 'go' | 'stay'
export type ResidentView = 'building' | 'ar'
export type OverlayKind = 'fire' | 'smoke' | 'risk'
export type SimTool = 'fire' | 'smoke' | 'blocked' | 'remove' | 'move'
export type FloorFilter = 'all' | FloorId
