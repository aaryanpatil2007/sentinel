/** In-memory EngineClient for tests, serving the recorded snapshot and logging calls. */
import { EngineError, rescueRouteId, type EngineClient } from './client'
import { ENGINE_FIXTURE } from './fixture'
import type { Entity, EngineEvent, HazardType, IncidentSnapshot, Route } from './types'

type Call = { method: keyof EngineClient; args: unknown[] }

export class FakeEngine implements EngineClient {
  calls: Call[] = []
  /** When true every call throws an "unreachable" EngineError. */
  down = false
  /** When false the engine has no civilians until a report arrives. */
  seeded: boolean
  evacuationOverrides: Record<string, Route | null> = {}
  private queue: EngineEvent[] = []
  private seq = 0

  constructor({ seeded = true }: { seeded?: boolean } = {}) {
    this.seeded = seeded
  }

  callsTo(method: keyof EngineClient): Call[] {
    return this.calls.filter((c) => c.method === method)
  }

  emit(eventType: string): void {
    this.seq += 1
    this.queue = [...this.queue, { seq: this.seq, timestamp: 't', event_type: eventType, payload: {} }]
  }

  private hit(method: keyof EngineClient, args: unknown[]): void {
    this.calls = [...this.calls, { method, args }]
    if (this.down) throw new EngineError(`${method} unreachable`, null)
  }

  private civilian(id?: string): Entity {
    const civilians = ENGINE_FIXTURE.state.entities.filter((e) => e.entity_type === 'civilian')
    return civilians.find((c) => c.entity_id === id) ?? civilians[0]
  }

  async graph() {
    this.hit('graph', [])
    return ENGINE_FIXTURE.graph
  }

  async state(): Promise<IncidentSnapshot> {
    this.hit('state', [])
    const s = ENGINE_FIXTURE.state
    return this.seeded ? { ...s, last_event_seq: this.seq } : { ...s, entities: [], hazards: [], routes: [], last_event_seq: this.seq }
  }

  async events(since: number) {
    this.hit('events', [since])
    const out = this.queue.filter((e) => e.seq > since)
    this.queue = []
    return out
  }

  async prediction() {
    this.hit('prediction', [])
    return ENGINE_FIXTURE.prediction
  }

  async prioritize() {
    this.hit('prioritize', [])
    return this.seeded ? ENGINE_FIXTURE.recommendations : []
  }

  async evacuation(id: string) {
    this.hit('evacuation', [id])
    return id in this.evacuationOverrides ? this.evacuationOverrides[id] : ENGINE_FIXTURE.evacuations[id] ?? null
  }

  async advisory(id: string) {
    this.hit('advisory', [id])
    return ENGINE_FIXTURE.advisories[id]
  }

  async reset() {
    this.hit('reset', [])
    this.seeded = false
    this.seq = 0
    this.queue = []
  }

  async report(text: string, civilianId?: string) {
    this.hit('report', [text, civilianId])
    this.seeded = true
    this.emit('civilian_report')
    const civilian = this.civilian(civilianId)
    return { civilian, report: civilian.report!, priority: civilian.priority! }
  }

  async moveCivilian(civilianId: string, nodeId: string) {
    this.hit('moveCivilian', [civilianId, nodeId])
    this.emit('entity_location_updated')
    return this.civilian(civilianId)
  }

  async addResponder(responderId: string, name: string, nodeId: string) {
    this.hit('addResponder', [responderId, name, nodeId])
    this.emit('entity_registered')
    return this.civilian()
  }

  async addHazard(hazardType: HazardType, nodeId: string) {
    this.hit('addHazard', [hazardType, nodeId])
    this.emit('hazard_added')
    return ENGINE_FIXTURE.state.hazards[0]
  }

  async removeHazard(hazardId: string) {
    this.hit('removeHazard', [hazardId])
    this.emit('hazard_removed')
  }

  async ignite(nodeId: string) {
    this.hit('ignite', [nodeId])
    this.emit('hazard_added')
  }

  async computeRoute(responderId: string, civilianId: string) {
    this.hit('computeRoute', [responderId, civilianId])
    this.emit('route_computed')
    return ENGINE_FIXTURE.state.routes.find((r) => r.route_id === rescueRouteId(responderId)) ?? ENGINE_FIXTURE.state.routes[0]
  }

  async observe(observation: Parameters<EngineClient['observe']>[0]) {
    this.hit('observe', [observation])
    this.emit('observation_ingested')
  }
}
