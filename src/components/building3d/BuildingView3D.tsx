import { Box } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { BuildingScene } from './BuildingScene'
import type { SceneCallbacks, SceneInput } from './types'

export type BuildingView3DProps = SceneInput & SceneCallbacks & { className?: string }

/** React host for the three.js scene. Keep this prop contract when swapping in another building renderer. */
export function BuildingView3D({ className, onPickEntity, onPickNode, onPickHazard, ...input }: BuildingView3DProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BuildingScene | null>(null)
  const callbacksRef = useRef<SceneCallbacks>({})
  const [failed, setFailed] = useState(false)
  callbacksRef.current = { onPickEntity, onPickNode, onPickHazard }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    try {
      sceneRef.current = new BuildingScene(host, {
        onPickEntity: (id) => callbacksRef.current.onPickEntity?.(id),
        onPickNode: (id) => callbacksRef.current.onPickNode?.(id),
        onPickHazard: (id) => callbacksRef.current.onPickHazard?.(id),
      })
    } catch (err) {
      console.error('3D building view unavailable', err)
      setFailed(true)
    }
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  const { markers, hazards, paths, risk, showFire, showSmoke, showRisk, floor, focusFloor, highlightNodeId, highlightTone, pickableNodes } = input
  useEffect(() => {
    sceneRef.current?.update({ markers, hazards, paths, risk, showFire, showSmoke, showRisk, floor, focusFloor, highlightNodeId, highlightTone, pickableNodes })
  }, [markers, hazards, paths, risk, showFire, showSmoke, showRisk, floor, focusFloor, highlightNodeId, highlightTone, pickableNodes])

  if (failed) {
    return (
      <div className={cn('flex h-full w-full items-start gap-2 rounded-8 bg-surface-container p-4 text-14 text-on-surface-variant', className)}>
        <Box size={20} strokeWidth={1.75} aria-hidden />
        The 3D building view needs WebGL, which this browser has turned off.
      </div>
    )
  }
  return <div ref={hostRef} role="img" aria-label="Jacobs Hall, floors B to 3" className={cn('relative h-full w-full overflow-hidden rounded-8', className)} />
}
