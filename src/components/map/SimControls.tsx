import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Cloud, Eraser, Flame, FlaskConical, Move } from 'lucide-react'
import type { SimTool } from '../../types'
import { placeLabel } from '../../engine/derive'
import { fade } from '../../lib/motion'
import { useSentinel } from '../../store'
import { useCivilians, useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'

const TOOLS: SegmentOption<SimTool>[] = [
  { value: 'fire', label: 'Fire', icon: Flame },
  { value: 'smoke', label: 'Smoke', icon: Cloud },
  { value: 'blocked', label: 'Blocked', icon: Ban },
  { value: 'remove', label: 'Remove', icon: Eraser },
  { value: 'move', label: 'Move', icon: Move },
]

function useHint(): string {
  const tool = useSentinel((s) => s.simTool)
  const moveSourceId = useSentinel((s) => s.moveSourceId)
  const pending = useSentinel((s) => s.pending)
  const civilians = useCivilians()
  const nodes = useNodes()
  if (pending) return 'Updating the engine…'
  if (tool === 'remove') return 'Click a hazard to clear it.'
  if (tool === 'move') {
    const source = civilians.find((c) => c.entity_id === moveSourceId)
    return source ? `Click where ${placeLabel(source, nodes)} moved to.` : 'Click a civilian to move.'
  }
  return 'Click a room, corridor or stair.'
}

export function SimControls() {
  const simMode = useSentinel((s) => s.simMode)
  const setSimMode = useSentinel((s) => s.setSimMode)
  const tool = useSentinel((s) => s.simTool)
  const setTool = useSentinel((s) => s.setSimTool)
  const live = useSentinel((s) => s.engineStatus === 'live')
  const hint = useHint()

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={simMode ? 'tonal' : 'outline'}
        icon={FlaskConical}
        aria-pressed={simMode}
        disabled={!live}
        title={live ? undefined : 'Engine offline'}
        onClick={() => setSimMode(!simMode)}
      >
        Simulate
      </Button>
      <AnimatePresence initial={false}>
        {simMode && live && (
          <motion.div {...fade} className="flex items-center gap-2">
            <SegmentedControl size="sm" layoutId="sim-tool" ariaLabel="Simulation tool" options={TOOLS} value={tool} onChange={setTool} />
            <span className="hidden text-12 text-on-surface-variant 2xl:inline" role="status">{hint}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
