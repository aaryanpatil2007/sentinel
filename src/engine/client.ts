import type {
  Advisory,
  BuildingGraph,
  EngineEvent,
  Entity,
  Hazard,
  HazardType,
  IncidentSnapshot,
  ObservationInput,
  Recommendation,
  ReportResult,
  Route,
  SpreadPrediction,
} from './types'

export const DEFAULT_ENGINE_URL = 'http://localhost:8787'
export const REQUEST_TIMEOUT_MS = 4000

export class EngineError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'EngineError'
    this.status = status
  }
}

export const rescueRouteId = (responderId: string) => `RESCUE_${responderId}`

// Checks by name: under jsdom the abort reason is a DOMException, which is not instanceof Error.
const isAbort = (err: unknown) => typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'

export type EngineClient = {
  graph(): Promise<BuildingGraph>
  state(): Promise<IncidentSnapshot>
  events(since: number): Promise<EngineEvent[]>
  prediction(): Promise<SpreadPrediction>
  prioritize(): Promise<Recommendation[]>
  evacuation(civilianId: string): Promise<Route | null>
  advisory(civilianId: string): Promise<Advisory>
  reset(): Promise<void>
  report(text: string, civilianId?: string): Promise<ReportResult>
  moveCivilian(civilianId: string, nodeId: string): Promise<Entity>
  addResponder(responderId: string, name: string, nodeId: string): Promise<Entity>
  addHazard(hazardType: HazardType, nodeId: string): Promise<Hazard>
  removeHazard(hazardId: string): Promise<void>
  ignite(nodeId: string): Promise<void>
  computeRoute(responderId: string, civilianId: string): Promise<Route>
  observe(observation: ObservationInput): Promise<void>
}

type Method = 'GET' | 'POST' | 'DELETE'

export function createEngineClient(baseUrl: string = DEFAULT_ENGINE_URL, fetchImpl: typeof fetch = fetch): EngineClient {
  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new EngineError(`${method} ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`, res.status)
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof EngineError) throw err
      const reason = isAbort(err) ? 'timed out' : 'unreachable'
      throw new EngineError(`${method} ${path} ${reason}`, null)
    } finally {
      clearTimeout(timer)
    }
  }

  const civ = (id: string) => `/civilians/${encodeURIComponent(id)}`

  return {
    graph: () => request('GET', '/building/graph'),
    state: () => request('GET', '/incident/state'),
    events: async (since) => (await request<{ events: EngineEvent[] }>('GET', `/incident/events?since=${since}`)).events,
    prediction: () => request('GET', '/spread/prediction'),
    prioritize: async () => (await request<{ recommendations: Recommendation[] }>('POST', '/rescue/prioritize')).recommendations,
    evacuation: async (id) => {
      const result = await request<Route | { status: 'no_location' }>('GET', `${civ(id)}/evacuation`)
      return 'route_id' in result ? result : null
    },
    advisory: (id) => request('GET', `${civ(id)}/advisory`),
    reset: async () => {
      await request('POST', '/incident/reset')
    },
    report: (text, civilianId) => request('POST', '/civilians/report', civilianId ? { text, civilian_id: civilianId } : { text }),
    moveCivilian: (civilianId, nodeId) => request('POST', '/civilians/location', { civilian_id: civilianId, graph_node_id: nodeId }),
    addResponder: (responderId, name, nodeId) => request('POST', '/responders', { responder_id: responderId, name, graph_node_id: nodeId }),
    addHazard: (hazardType, nodeId) => request('POST', '/hazards', { hazard_type: hazardType, node_id: nodeId, verified: true, source: 'responder_report' }),
    removeHazard: async (id) => {
      await request('DELETE', `/hazards/${encodeURIComponent(id)}`)
    },
    ignite: async (nodeId) => {
      await request('POST', '/spread/ignite', { node_id: nodeId })
    },
    computeRoute: (responderId, civilianId) =>
      request('POST', '/routes/compute', { responder_id: responderId, civilian_id: civilianId, route_id: rescueRouteId(responderId) }),
    observe: async (observation) => {
      await request('POST', '/observations', { ...observation, source: 'simulated_camera', position_status: 'simulated', provenance: 'simulated' })
    },
  }
}
