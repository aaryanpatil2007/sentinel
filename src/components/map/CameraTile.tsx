import { Minimize2, Video, VideoOff } from 'lucide-react'
import type { CameraSpec } from '../../data/scenarioThreads'
import { cn } from '../../lib/cn'
import { formatClock } from '../../lib/format'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'

type Props = {
  feed: CameraSpec
  now: number
  expanded?: boolean
  compact?: boolean
  onClick: () => void
  className?: string
}

/** Placeholder feed. Wire real video into the inner area later. */
export function CameraTile({ feed, now, expanded, compact, onClick, className }: Props) {
  const live = feed.status === 'live'
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(expanded)}
      aria-label={`${feed.label} camera, ${live ? 'live' : 'no signal'}. ${expanded ? 'Collapse' : 'Expand'}`}
      className={cn('state-layer focus-ring relative overflow-hidden rounded-8 border border-outline bg-surface-container-high text-left', className)}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-on-surface-variant">
        {live ? (
          <Video size={compact ? 16 : 20} strokeWidth={1.75} className="opacity-40" aria-hidden />
        ) : (
          <>
            <VideoOff size={compact ? 16 : 20} strokeWidth={1.75} aria-hidden />
            {!compact && <span className="text-12 font-medium">No signal</span>}
          </>
        )}
      </div>
      <span className={cn('absolute left-2 top-2 rounded-8 bg-surface px-2 py-0.5 font-medium', compact ? 'text-11' : 'text-12')}>{feed.label}</span>
      {!compact && (
        <span className="absolute right-2 top-2 flex items-center gap-1 text-11 font-medium">
          <StatusDot tone={live ? 'safe' : 'neutral'} />
          <span className={live ? 'text-success' : 'text-on-surface-variant'}>{live ? 'Live' : 'Offline'}</span>
        </span>
      )}
      {!compact && (
        <MonoText className="absolute bottom-2 left-2 text-11 text-on-surface-variant">{live ? formatClock(now) : '--:--:--'}</MonoText>
      )}
      {expanded && <Minimize2 size={16} strokeWidth={1.75} className="absolute bottom-2 right-2 text-on-surface-variant" aria-hidden />}
    </button>
  )
}
