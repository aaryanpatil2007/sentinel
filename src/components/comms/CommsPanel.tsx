import { AnimatePresence, motion } from 'framer-motion'
import { fade } from '../../lib/motion'
import { useSentinel } from '../../store'
import { Panel } from '../ui/Panel'
import { FirefighterComms } from './FirefighterComms'
import { ResidentComms } from './ResidentComms'

export function CommsPanel({ className }: { className?: string }) {
  const perspective = useSentinel((s) => s.perspective)
  return (
    <Panel className={className} aria-label="Communication">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={perspective} {...fade} className="flex min-h-0 flex-1">
          {perspective === 'firefighter' ? <FirefighterComms /> : <ResidentComms />}
        </motion.div>
      </AnimatePresence>
    </Panel>
  )
}
