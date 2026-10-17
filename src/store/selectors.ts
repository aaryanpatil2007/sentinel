import { useMemo } from 'react'
import type { GoStay, Message, Thread } from '../types'
import { civiliansOf, indexNodes, respondersOf, type NodeIndex } from '../engine/derive'
import type { BuildingGraph, Entity, Route } from '../engine/types'
import { useSentinel } from './index'

let nodeCache: { graph: BuildingGraph | null; nodes: NodeIndex } = { graph: null, nodes: new Map() }

/** Memoized on graph identity; the graph loads once per session. */
export function nodesFor(graph: BuildingGraph | null): NodeIndex {
  if (nodeCache.graph !== graph) nodeCache = { graph, nodes: indexNodes(graph) }
  return nodeCache.nodes
}

export function useNodes(): NodeIndex {
  return nodesFor(useSentinel((s) => s.graph))
}

export function useCivilians(): Entity[] {
  const snapshot = useSentinel((s) => s.snapshot)
  return useMemo(() => civiliansOf(snapshot), [snapshot])
}

/** The civilian the resident views as; falls back to the first civilian when viewingAsId is unknown. */
export function useViewedCivilian(): Entity | undefined {
  const civilians = useCivilians()
  const viewingAsId = useSentinel((s) => s.viewingAsId)
  return civilians.find((c) => c.entity_id === viewingAsId) ?? civilians[0]
}

export function useResponders(): Entity[] {
  const snapshot = useSentinel((s) => s.snapshot)
  return useMemo(() => respondersOf(snapshot), [snapshot])
}

export function useEntity(id: string | null): Entity | undefined {
  return useSentinel((s) => (id ? s.snapshot?.entities.find((e) => e.entity_id === id) : undefined))
}

export function useThread(id: string): Thread | undefined {
  return useSentinel((s) => s.threads.find((t) => t.id === id))
}

/** Applies the demo Go/Stay override to a resident's evacuation route. */
export function effectiveEvacuation(route: Route | null | undefined, override: GoStay): Route | null {
  if (!route) return null
  if (override === 'stay') return { ...route, status: 'unreachable' }
  if (override === 'go' && route.polyline.length > 1) return { ...route, status: 'candidate' }
  return route
}

export function lastResidentMessage(thread: Thread | undefined): Message | undefined {
  return thread?.messages.filter((m) => m.from === 'resident').at(-1)
}
