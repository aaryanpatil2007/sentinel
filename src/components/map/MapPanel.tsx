import { AnimatePresence, motion } from 'framer-motion'
import { fade } from '../../lib/motion'
import { useSentinel } from '../../store'
import { Panel } from '../ui/Panel'
import { FirefighterMap } from './FirefighterMap'
import { ResidentMap } from './ResidentMap'

export function MapPanel({ className }: { className?: string }) {
  const perspective = useSentinel((s) => s.perspective)
  return (
    <Panel className={className} aria-label="Building map">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={perspective} {...fade} className="flex min-h-0 flex-1 flex-col">
          {perspective === 'firefighter' ? <FirefighterMap /> : <ResidentMap />}
        </motion.div>
      </AnimatePresence>
    </Panel>
  )
}
