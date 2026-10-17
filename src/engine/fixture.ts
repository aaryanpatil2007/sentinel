import raw from '../data/engine-snapshot.json'
import type { Advisory, BuildingGraph, IncidentSnapshot, Recommendation, Route, SpreadPrediction } from './types'

/** A real engine incident recorded by scripts/capture_engine_snapshot.py, shown when the engine is offline. */
export type EngineFixture = {
  graph: BuildingGraph
  state: IncidentSnapshot
  prediction: SpreadPrediction
  recommendations: Recommendation[]
  evacuations: Record<string, Route | null>
  advisories: Record<string, Advisory>
}

export const ENGINE_FIXTURE = raw as unknown as EngineFixture
