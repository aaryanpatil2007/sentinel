import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import type { GoStay } from '../../types'
import { placeLabel } from '../../engine/derive'
import { useDismiss } from '../../hooks/useDismiss'
import { fadeDrop } from '../../lib/motion'
import { useSentinel } from '../../store'
import { useCivilians, useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'

const GO_STAY_OPTIONS: SegmentOption<GoStay>[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'go', label: 'Go' },
  { value: 'stay', label: 'Stay' },
]

export function DevMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(ref, open, close)

  const civilians = useCivilians()
  const nodes = useNodes()
  const viewingAsId = useSentinel((s) => s.viewingAsId)
  const setViewingAs = useSentinel((s) => s.setViewingAs)
  const devGoStay = useSentinel((s) => s.devGoStay)
  const setDevGoStay = useSentinel((s) => s.setDevGoStay)
  const resetDemo = useSentinel((s) => s.resetDemo)

  return (
    <div ref={ref} className="relative">
      <IconButton icon={SlidersHorizontal} label="Demo controls" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
      <AnimatePresence>
        {open && (
          <motion.div
            {...fadeDrop}
            className="absolute right-0 top-10 z-30 w-72 rounded-12 border border-outline bg-surface p-4 shadow-float"
          >
            <p className="text-12 font-medium text-on-surface-variant">Demo controls</p>
            <label htmlFor="viewing-as" className="mt-4 block text-12 text-on-surface-variant">
              Resident view as
            </label>
            <select
              id="viewing-as"
              value={viewingAsId}
              onChange={(e) => setViewingAs(e.target.value)}
              className="focus-ring mt-1 h-8 w-full rounded-8 border border-outline bg-surface px-2 font-mono text-14"
            >
              {civilians.map((c) => (
                <option key={c.entity_id} value={c.entity_id}>
                  {placeLabel(c, nodes)} · {c.entity_id}
                </option>
              ))}
            </select>
            <p className="mt-4 text-12 text-on-surface-variant">Resident route</p>
            <div className="mt-1">
              <SegmentedControl
                size="sm"
                layoutId="dev-go-stay"
                ariaLabel="Resident route override"
                options={GO_STAY_OPTIONS}
                value={devGoStay}
                onChange={setDevGoStay}
              />
            </div>
            <div className="mt-4 border-t border-outline pt-4">
              <Button
                size="sm"
                icon={RotateCcw}
                onClick={() => {
                  void resetDemo()
                  setOpen(false)
                }}
              >
                Reset demo
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
