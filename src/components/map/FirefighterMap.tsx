import { useMemo } from 'react'
import { BuildingView3D } from '../building3d/BuildingView3D'
import { buildHazards, buildMarkers, buildPaths } from '../building3d/sceneData'
import { useSentinel } from '../../store'
import { useCivilians, useNodes, useResponders } from '../../store/selectors'
import { CameraStrip } from './CameraStrip'
import { FloorSelector } from './FloorSelector'
import { LastUpdated } from './LastUpdated'
import { Legend } from './Legend'
import { MapToolbar } from './MapToolbar'
import { MarkerCard } from './MarkerCard'
import { OverlayToggles } from './OverlayToggles'
import { PriorityList } from './PriorityList'
import { SimControls } from './SimControls'

const EMPTY_RISK: Record<string, number> = {}

export function FirefighterMap() {
  const snapshot = useSentinel((s) => s.snapshot)
  const graph = useSentinel((s) => s.graph)
  const prediction = useSentinel((s) => s.prediction)
  const evacuations = useSentinel((s) => s.evacuations)
  const overlays = useSentinel((s) => s.overlays)
  const floor = useSentinel((s) => s.floor)
  const selectedId = useSentinel((s) => s.selectedCivilianId)
  const hoveredId = useSentinel((s) => s.hoveredCivilianId)
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const live = useSentinel((s) => s.engineStatus === 'live')
  const simMode = useSentinel((s) => s.simMode)
  const simTool = useSentinel((s) => s.simTool)
  const moveSourceId = useSentinel((s) => s.moveSourceId)
  const setMoveSource = useSentinel((s) => s.setMoveSource)
  const addHazard = useSentinel((s) => s.addHazard)
  const removeHazard = useSentinel((s) => s.removeHazard)
  const moveCivilian = useSentinel((s) => s.moveCivilian)
  const civilians = useCivilians()
  const responders = useResponders()
  const nodes = useNodes()
  const focusId = hoveredId ?? selectedId

  const markers = useMemo(() => buildMarkers(civilians, responders, nodes, { selectedId, hoveredId }), [civilians, responders, nodes, selectedId, hoveredId])
  const hazards = useMemo(() => buildHazards(snapshot?.hazards ?? [], nodes, graph?.edges ?? []), [snapshot, nodes, graph])
  const paths = useMemo(() => buildPaths(snapshot?.routes ?? [], focusId ? evacuations[focusId] : null, focusId), [snapshot, evacuations, focusId])

  const isCivilian = (id: string) => civilians.some((c) => c.entity_id === id)
  const onPickEntity = (id: string) => {
    if (!isCivilian(id)) return
    if (simMode && live && simTool === 'move') setMoveSource(id)
    else selectCivilian(id)
  }
  const onPickNode = (nodeId: string) => {
    if (!simMode || !live) return
    if (simTool === 'fire' || simTool === 'smoke' || simTool === 'blocked') void addHazard(simTool, nodeId)
    else if (simTool === 'move' && moveSourceId) {
      void moveCivilian(moveSourceId, nodeId)
      setMoveSource(null)
    }
  }
  const onPickHazard = (hazardId: string) => {
    if (simMode && live && simTool === 'remove') void removeHazard(hazardId)
  }
  const pickableNodes = live && simMode && (simTool === 'fire' || simTool === 'smoke' || simTool === 'blocked' || (simTool === 'move' && moveSourceId !== null))
  const moveSource = simMode && simTool === 'move' && moveSourceId ? civilians.find((c) => c.entity_id === moveSourceId)?.graph_node_id ?? null : null

  return (
    <>
      <MapToolbar
        leading={
          <div className="flex items-center gap-2">
            <FloorSelector />
            <SimControls />
          </div>
        }
      >
        <OverlayToggles />
      </MapToolbar>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="relative min-h-0 flex-1">
            <BuildingView3D
              markers={markers}
              hazards={hazards}
              paths={paths}
              risk={prediction?.risk ?? EMPTY_RISK}
              showFire={overlays.fire}
              showSmoke={overlays.smoke}
              showRisk={overlays.risk}
              floor={floor}
              onPickEntity={onPickEntity}
              onPickNode={onPickNode}
              onPickHazard={onPickHazard}
              pickableNodes={pickableNodes}
              highlightNodeId={moveSource}
            />
            <MarkerCard />
          </div>
          <div className="flex shrink-0 items-end justify-between gap-4 pt-2">
            <Legend variant="firefighter" />
            <LastUpdated />
          </div>
        </div>
        <PriorityList className="w-64 shrink-0 border-l border-outline" />
      </div>
      <CameraStrip />
    </>
  )
}
