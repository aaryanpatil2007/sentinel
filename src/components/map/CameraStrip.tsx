import { ScanSearch } from 'lucide-react'
import { useEffect } from 'react'
import { CAMERAS } from '../../data/scenarioThreads'
import { useNow } from '../../hooks/useNow'
import { useSentinel } from '../../store'
import { useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
import { MonoText } from '../ui/MonoText'
import { CameraTile } from './CameraTile'

export function CameraStrip() {
  const feeds = CAMERAS
  const expandedId = useSentinel((s) => s.expandedCameraId)
  const setExpanded = useSentinel((s) => s.setExpandedCamera)
  const nodes = useNodes()
  const live = useSentinel((s) => s.engineStatus === 'live')
  const pending = useSentinel((s) => s.pending)
  const simulateDetection = useSentinel((s) => s.simulateDetection)
  const now = useNow()
  const main = feeds.find((f) => f.id === expandedId)

  useEffect(() => {
    if (!main) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [main, setExpanded])

  return (
    <section aria-label="Cameras" className="shrink-0 border-t border-outline p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-12 font-medium text-on-surface-variant">Cameras</h3>
        <MonoText className="text-12 text-on-surface-variant">
          {feeds.filter((f) => f.status === 'live').length}/{feeds.length} live
        </MonoText>
      </div>
      {main && (
        <div className="mb-2 flex items-center gap-2 text-12 text-on-surface-variant">
          <MonoText>{main.nodeId}</MonoText>
          <span>· {nodes.get(main.nodeId)?.label ?? 'Unknown node'}</span>
          <span className="flex-1" />
          <Button
            size="sm"
            icon={ScanSearch}
            disabled={!live || pending || main.status !== 'live'}
            title={live ? undefined : 'Engine offline'}
            onClick={() => void simulateDetection(main)}
          >
            Simulate smoke detection
          </Button>
        </div>
      )}
      {main ? (
        <div className="grid h-56 grid-cols-[1fr_160px] gap-2">
          <CameraTile feed={main} now={now} expanded onClick={() => setExpanded(null)} className="h-full" />
          <div className="grid min-h-0 grid-rows-3 gap-2">
            {feeds
              .filter((f) => f.id !== main.id)
              .map((f) => (
                <CameraTile key={f.id} feed={f} now={now} compact onClick={() => setExpanded(f.id)} className="h-full" />
              ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2">
          {feeds.map((f) => (
            <CameraTile key={f.id} feed={f} now={now} onClick={() => setExpanded(f.id)} className="aspect-video" />
          ))}
        </div>
      )}
    </section>
  )
}
