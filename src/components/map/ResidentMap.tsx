import { AnimatePresence, motion } from 'framer-motion'
import { Building2, ScanEye } from 'lucide-react'
import { useMemo } from 'react'
import type { ResidentView } from '../../types'
import { floorOf, instructionMode, instructionsFor, peopleCount, placeLabel } from '../../engine/derive'
import { fade } from '../../lib/motion'
import { useSentinel } from '../../store'
import { effectiveEvacuation, useCivilians, useNodes } from '../../store/selectors'
import { BuildingView3D } from '../building3d/BuildingView3D'
import { buildHazards, shortLabel } from '../building3d/sceneData'
import type { SceneMarker, ScenePath } from '../building3d/types'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'
import { ARView } from './ARView'
import { InstructionCard } from './InstructionCard'
import { LastUpdated } from './LastUpdated'
import { Legend } from './Legend'
import { MapToolbar } from './MapToolbar'
import { OverlayToggles } from './OverlayToggles'

const VIEWS: SegmentOption<ResidentView>[] = [
  { value: 'building', label: 'Building', icon: Building2 },
  { value: 'ar', label: 'AR', icon: ScanEye },
]
const EMPTY_RISK: Record<string, number> = {}

export function ResidentMap() {
  const snapshot = useSentinel((s) => s.snapshot)
  const graph = useSentinel((s) => s.graph)
  const prediction = useSentinel((s) => s.prediction)
  const evacuations = useSentinel((s) => s.evacuations)
  const advisories = useSentinel((s) => s.advisories)
  const overlays = useSentinel((s) => s.overlays)
  const viewingAsId = useSentinel((s) => s.viewingAsId)
  const residentView = useSentinel((s) => s.residentView)
  const setResidentView = useSentinel((s) => s.setResidentView)
  const devGoStay = useSentinel((s) => s.devGoStay)
  const updatedAt = useSentinel((s) => s.updatedAt)
  const civilians = useCivilians()
  const nodes = useNodes()
  const civilian = civilians.find((c) => c.entity_id === viewingAsId) ?? civilians[0]

  const hazards = useMemo(() => buildHazards(snapshot?.hazards ?? [], nodes, graph?.edges ?? []), [snapshot, nodes, graph])
  const evacuation = civilian ? effectiveEvacuation(evacuations[civilian.entity_id], devGoStay) : null
  const mode = civilian ? instructionMode(civilian, evacuation, nodes) : 'stay'
  const instructions = civilian ? instructionsFor(civilian, evacuation, snapshot?.hazards ?? [], nodes) : []
  const advisory = civilian ? advisories[civilian.entity_id] : undefined
  const floor = civilian ? floorOf(civilian, nodes) : null

  const markers = useMemo<SceneMarker[]>(() => {
    const node = civilian?.graph_node_id ? nodes.get(civilian.graph_node_id) : undefined
    if (!civilian || !node) return []
    return [{ id: civilian.entity_id, kind: 'civilian', floor: node.floor_id, x: node.x, y: node.y, label: `You · ${shortLabel(placeLabel(civilian, nodes))}`, tone: 'safe', selected: true }]
  }, [civilian, nodes])
  const paths = useMemo<ScenePath[]>(
    () => (mode === 'go' && evacuation && evacuation.polyline.length > 1 ? [{ id: evacuation.route_id, points: evacuation.polyline, variant: 'evacuation', emphasized: true }] : []),
    [mode, evacuation],
  )

  if (!civilian) return <div className="p-4 text-14 text-on-surface-variant">No resident to show.</div>

  return (
    <>
      <MapToolbar
        leading={
          <div className="flex items-center gap-2">
            <SegmentedControl size="sm" layoutId="resident-view" ariaLabel="Resident view" options={VIEWS} value={residentView} onChange={setResidentView} />
            <span className="hidden text-12 text-on-surface-variant lg:inline">
              {placeLabel(civilian, nodes)} · {peopleCount(civilian)} {peopleCount(civilian) === 1 ? 'person' : 'people'}
            </span>
          </div>
        }
      >
        <OverlayToggles />
      </MapToolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <InstructionCard mode={mode} instructions={instructions} updatedAt={updatedAt} />
        {advisory && (
          <details className="-mt-2 shrink-0 text-12 text-on-surface-variant">
            <summary className="focus-ring cursor-pointer rounded-8">Full advisory · pending command approval</summary>
            <p className="mt-1 text-14 text-on-surface">{advisory.message}</p>
          </details>
        )}
        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={residentView} {...fade} className="absolute inset-0">
              {residentView === 'building' ? (
                <BuildingView3D
                  markers={markers}
                  hazards={hazards}
                  paths={paths}
                  risk={prediction?.risk ?? EMPTY_RISK}
                  showFire={overlays.fire}
                  showSmoke={overlays.smoke}
                  showRisk={overlays.risk}
                  floor="all"
                  focusFloor={floor}
                  highlightNodeId={civilian.graph_node_id}
                  highlightTone={mode === 'stay' ? 'warning' : 'primary'}
                />
              ) : (
                <ARView civilian={civilian} route={evacuation} instructions={instructions} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-end justify-between gap-4">
          <Legend variant="resident" />
          <LastUpdated />
        </div>
      </div>
    </>
  )
}
