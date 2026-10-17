import type { CameraSpec } from '../data/scenarioThreads'
import scenario from '../data/scenario.json'
import { EngineError, type EngineClient } from '../engine/client'
import { civiliansOf, indexNodes, nodePosition } from '../engine/derive'
import { latestSeq, needsRefresh } from '../engine/events'
import { ENGINE_FIXTURE } from '../engine/fixture'
import { getEngineClient } from '../engine/instance'
import type { Advisory, BuildingGraph, HazardType, IncidentSnapshot, Recommendation, Route, SpreadPrediction } from '../engine/types'
import { appendMessages, incidentChangeMessages } from './events'
import type { SliceCreator } from './types'

export const POLL_MS = 1500
export const RETRY_MS = 5000
export const FULL_REFRESH_MS = 15_000
export const STAGING_NODE = 'EXT_STAGING'
const DETECTION_CONFIDENCE = 0.82

export type EngineStatus = 'connecting' | 'live' | 'offline'

export type EngineData = {
  graph: BuildingGraph | null
  snapshot: IncidentSnapshot | null
  prediction: SpreadPrediction | null
  recommendations: Recommendation[]
  evacuations: Record<string, Route | null>
  advisories: Record<string, Advisory>
  lastSeq: number
  updatedAt: number
}

export type EngineSlice = EngineData & {
  engineStatus: EngineStatus
  engineError: string | null
  pending: boolean
  connect: () => Promise<void>
  poll: () => Promise<void>
  refresh: () => Promise<void>
  refreshSafely: () => Promise<void>
  seed: () => Promise<void>
  resetIncident: () => Promise<boolean>
  reportCivilian: (civilianId: string, text: string) => Promise<boolean>
  moveCivilian: (civilianId: string, nodeId: string) => Promise<boolean>
  addHazard: (type: HazardType, nodeId: string) => Promise<boolean>
  removeHazard: (hazardId: string) => Promise<boolean>
  assignResponder: (responderId: string, civilianId: string) => Promise<boolean>
  simulateDetection: (camera: CameraSpec) => Promise<boolean>
}

export function emptyEngineData(): EngineData {
  return { graph: null, snapshot: null, prediction: null, recommendations: [], evacuations: {}, advisories: {}, lastSeq: 0, updatedAt: 0 }
}

export function fixtureData(now: number): EngineData {
  return {
    graph: ENGINE_FIXTURE.graph,
    snapshot: ENGINE_FIXTURE.state,
    prediction: ENGINE_FIXTURE.prediction,
    recommendations: ENGINE_FIXTURE.recommendations,
    evacuations: ENGINE_FIXTURE.evacuations,
    advisories: ENGINE_FIXTURE.advisories,
    lastSeq: 0,
    updatedAt: now,
  }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))
const isConnectionLoss = (err: unknown) => err instanceof EngineError && err.status === null

// Single-flight guards: StrictMode double effects and overlapping intervals must not seed or refresh twice.
let connecting: Promise<void> | null = null
let refreshing: Promise<void> | null = null
let polling = false
let seeding: Promise<void> | null = null
// Set by seed so the next refresh does not diff the new incident against the pre-reset one.
let skipNextDiff = false

export const createEngineSlice: SliceCreator<EngineSlice> = (set, get) => {
  const goOffline = (err: unknown) => {
    // Keep whatever data exists (live or recorded); only load the recording when there is nothing.
    const hasData = get().snapshot !== null
    set({ engineStatus: 'offline', engineError: messageOf(err), ...(hasData ? {} : fixtureData(Date.now())) })
  }

  const runAction = async (action: (client: EngineClient) => Promise<unknown>): Promise<boolean> => {
    if (get().engineStatus !== 'live') {
      set({ engineError: 'Engine offline · changes are disabled' })
      return false
    }
    set({ pending: true })
    try {
      await action(getEngineClient())
      await get().refresh()
      set({ engineError: null })
      return true
    } catch (err) {
      if (isConnectionLoss(err)) goOffline(err)
      else set({ engineError: messageOf(err) })
      return false
    } finally {
      set({ pending: false })
    }
  }

  return {
    ...fixtureData(Date.now()),
    engineStatus: 'connecting',
    engineError: null,
    pending: false,

    connect: () => {
      if (connecting) return connecting
      connecting = (async () => {
        try {
          const client = getEngineClient()
          set({ graph: await client.graph() })
          const snapshot = await client.state()
          if (civiliansOf(snapshot).length === 0) await get().seed()
          else await get().refresh()
          set({ engineStatus: 'live', engineError: null })
        } catch (err) {
          goOffline(err)
        } finally {
          connecting = null
        }
      })()
      return connecting
    },

    refresh: () => {
      if (refreshing) return refreshing
      refreshing = (async () => {
        try {
          const client = getEngineClient()
          const [snapshot, prediction, recommendations] = await Promise.all([client.state(), client.prediction(), client.prioritize()])
          const ids = civiliansOf(snapshot).map((c) => c.entity_id)
          const routes = await Promise.all(ids.map((id) => client.evacuation(id)))
          const evacuations: Record<string, Route | null> = Object.fromEntries(ids.map((id, i) => [id, routes[i]]))
          const viewing = get().viewingAsId
          const advisories = ids.includes(viewing) ? { ...get().advisories, [viewing]: await client.advisory(viewing) } : get().advisories
          const now = Date.now()
          // Only diff against live observations, never against the offline recording.
          // An external reset (seq restarts lower) or our own reseed also skips the diff.
          const externalReset = snapshot.last_event_seq < get().lastSeq
          const skipDiff = skipNextDiff || externalReset
          skipNextDiff = false
          const previous = get().engineStatus === 'live' && !skipDiff ? { snapshot: get().snapshot, evacuations: get().evacuations } : { snapshot: null, evacuations: {} }
          const messages = skipDiff ? [] : incidentChangeMessages(previous, { snapshot, evacuations }, indexNodes(get().graph), now)
          set((s) => ({
            snapshot,
            prediction,
            recommendations,
            evacuations,
            advisories,
            lastSeq: externalReset ? snapshot.last_event_seq : Math.max(s.lastSeq, snapshot.last_event_seq),
            updatedAt: now,
            threads: appendMessages(s.threads, messages),
          }))
        } finally {
          refreshing = null
        }
      })()
      return refreshing
    },

    refreshSafely: async () => {
      try {
        await get().refresh()
      } catch (err) {
        if (isConnectionLoss(err)) goOffline(err)
        else set({ engineError: messageOf(err) })
      }
    },

    poll: async () => {
      if (seeding) return
      if (get().engineStatus !== 'live') {
        await get().connect()
        return
      }
      if (polling) return
      polling = true
      try {
        const events = await getEngineClient().events(get().lastSeq)
        set({ lastSeq: latestSeq(events, get().lastSeq) })
        if (needsRefresh(events) || Date.now() - get().updatedAt > FULL_REFRESH_MS) await get().refresh()
      } catch (err) {
        if (isConnectionLoss(err)) goOffline(err)
        else set({ engineError: messageOf(err) })
      } finally {
        polling = false
      }
    },

    seed: () => {
      if (seeding) return seeding
      seeding = (async () => {
        try {
          const client = getEngineClient()
          await client.reset()
          set({ lastSeq: 0 })
          skipNextDiff = true
          for (const resident of scenario.residents) await client.report(resident.text)
          for (const responder of scenario.responders) await client.addResponder(responder.id, responder.name, responder.node)
          for (const node of scenario.ignite) await client.ignite(node)
          for (const hazard of scenario.hazards) await client.addHazard(hazard.type as HazardType, hazard.node)
          const recommendations = await client.prioritize()
          for (const [i, responder] of scenario.responders.entries()) {
            const rec = recommendations[i]
            if (rec) await client.computeRoute(responder.id, rec.civilian_id)
          }
          await get().refresh()
        } catch (err) {
          skipNextDiff = false
          throw err
        } finally {
          seeding = null
        }
      })()
      return seeding
    },

    resetIncident: async () => {
      if (get().engineStatus !== 'live') {
        set(fixtureData(Date.now()))
        void get().connect()
        return false
      }
      set({ pending: true })
      try {
        await get().seed()
        return true
      } catch (err) {
        if (isConnectionLoss(err)) goOffline(err)
        else set({ engineError: messageOf(err) })
        return false
      } finally {
        set({ pending: false })
      }
    },

    reportCivilian: (civilianId, text) =>
      runAction(async (client) => {
        const before = civiliansOf(get().snapshot).find((c) => c.entity_id === civilianId)
        const prior = before?.report?.raw_text
        const full = !prior ? text : prior.endsWith(text) ? prior : `${prior} ${text}`
        const result = await client.report(full, civilianId)
        // The engine re-resolves location from the whole text; undo a move that only came from the old text.
        const recorded = before?.graph_node_id
        const priorNode = before?.report?.location?.node_id
        const now = result.civilian.graph_node_id
        if (recorded && now !== recorded && now === priorNode) await client.moveCivilian(civilianId, recorded)
      }),

    moveCivilian: (civilianId, nodeId) => runAction((client) => client.moveCivilian(civilianId, nodeId)),

    addHazard: (type, nodeId) => runAction((client) => (type === 'fire' ? client.ignite(nodeId) : client.addHazard(type, nodeId))),

    removeHazard: (hazardId) => runAction((client) => client.removeHazard(hazardId)),

    assignResponder: (responderId, civilianId) => runAction((client) => client.computeRoute(responderId, civilianId)),

    simulateDetection: (camera) =>
      runAction(async (client) => {
        const node = get().graph?.nodes.find((n) => n.node_id === camera.nodeId)
        if (!node) throw new Error(`Camera ${camera.id} is not on a known node`)
        await client.observe({
          observation_id: `OBS_${camera.id}_${Date.now()}`,
          type: 'smoke',
          graph_node_id: node.node_id,
          world_position: nodePosition(node),
          camera_id: camera.id,
          confidence: DETECTION_CONFIDENCE,
        })
      }),
  }
}
