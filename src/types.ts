export type Floor = 1 | 2 | 3 | 4
/** Top to bottom, the order floors are drawn. */
export const FLOORS: readonly Floor[] = [4, 3, 2, 1]

export type Priority = 'critical' | 'moderate' | 'safe'
export type Status = 'trapped' | 'immobile' | 'sheltering' | 'evacuating' | 'evacuated' | 'unknown'

/** Per-floor plan units, 1000 × 300. */
export type Point = { floor: Floor; x: number; y: number }

export type Person = {
  id: string
  unit: string
  pos: Point
  count: number
  priority: Priority
  status: Status
  mobility: string[]
  lastUpdate: number
}

/** 0 clear, 1 smoke, 2 fire. */
export type HazardValue = 0 | 1 | 2
/** 24 × 8 cells per floor, row-major. */
export type HazardGrid = Record<Floor, HazardValue[]>
export type Region = { floor: Floor; x: number; y: number; w: number; h: number }
export type World = { people: Person[]; hazards: HazardGrid; structural: Region[] }

export type StairId = 'A' | 'B'
export type Route = {
  personId: string
  kind: 'entry' | 'exit'
  points: Point[]
  via: StairId | null
  blocked: boolean
  distanceM: number
  etaS: number
}

export type Instruction = { text: string; tone: 'go' | 'stay' | 'info' }
export type InstructionMode = 'go' | 'stay' | 'out'
export type RankedPerson = { personId: string; rank: number; distanceM: number; etaS: number }

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

export type Camera = { id: string; label: string; pos: Point; status: 'live' | 'no-signal' }
export type Incident = { name: string; address: string; startedAt: number }

export type Perspective = 'firefighter' | 'resident'
export type OverlayKind = 'fire' | 'smoke' | 'structural'
export type Brush = 'fire' | 'smoke' | 'erase'
export type GoStay = 'auto' | 'go' | 'stay'
export type ResidentView = 'building' | 'ar'
