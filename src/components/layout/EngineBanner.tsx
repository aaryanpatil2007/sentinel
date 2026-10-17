import { AnimatePresence, motion } from 'framer-motion'
import { RotateCw, ServerOff } from 'lucide-react'
import { fadeDrop } from '../../lib/motion'
import { useSentinel } from '../../store'
import { Button } from '../ui/Button'
import { MonoText } from '../ui/MonoText'

export function EngineBanner() {
  const status = useSentinel((s) => s.engineStatus)
  const error = useSentinel((s) => s.engineError)
  const connect = useSentinel((s) => s.connect)
  return (
    <AnimatePresence initial={false}>
      {status === 'offline' && (
        <motion.div {...fadeDrop} role="alert" className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-12 text-warning">
          <ServerOff size={16} strokeWidth={1.75} aria-hidden />
          <span className="font-medium">Engine offline · showing recorded incident.</span>
          <span className="hidden text-on-surface-variant md:inline">
            Start it with <MonoText>npm run engine</MonoText>.
          </span>
          {error && <MonoText className="hidden truncate text-11 text-on-surface-variant lg:inline">{error}</MonoText>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" icon={RotateCw} onClick={() => void connect()}>
            Retry
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
