import { Radio } from 'lucide-react'
import type { Thread } from '../../types'
import { civilianTone, placeLabel } from '../../engine/derive'
import type { Entity } from '../../engine/types'
import { cn } from '../../lib/cn'
import { formatClock } from '../../lib/format'
import { QUICK_REPLY_LABEL } from '../../lib/labels'
import { useSentinel } from '../../store'
import { useCivilians, useNodes } from '../../store/selectors'
import { shortLabel } from '../building3d/sceneData'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'

type RowProps = { thread: Thread; civilian?: Entity; selected: boolean; onSelect: (id: string) => void }

function ThreadRow({ thread, civilian, selected, onSelect }: RowProps) {
  const nodes = useNodes()
  const last = thread.messages.at(-1)
  const preview = last ? (last.quick ? QUICK_REPLY_LABEL[last.quick] : last.text) : 'No messages'
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={selected ? 'true' : undefined}
        className={cn('state-layer focus-ring relative flex w-full flex-col gap-0.5 rounded-8 px-2 py-2 text-left', selected && 'bg-surface-container-high')}
      >
        {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-primary" />}
        <div className="flex items-center gap-2">
          <span className="flex w-4 justify-center">
            {civilian ? <StatusDot tone={civilianTone(civilian, nodes)} /> : <Radio size={16} strokeWidth={1.75} className="text-on-surface-variant" aria-hidden />}
          </span>
          <span className={cn('min-w-0 flex-1 truncate text-14 font-semibold', civilian && 'font-mono')}>{civilian ? shortLabel(placeLabel(civilian, nodes)) : 'Crew'}</span>
          {last && <MonoText className="text-11 text-on-surface-variant">{formatClock(last.at).slice(0, 5)}</MonoText>}
        </div>
        <div className="flex items-center gap-2 pl-6">
          <span className="min-w-0 flex-1 truncate text-12 text-on-surface-variant">{preview}</span>
          {thread.unread > 0 && (
            <MonoText className="rounded-8 bg-primary px-1.5 text-11 font-medium text-surface" aria-label={`${thread.unread} unread`}>
              {thread.unread}
            </MonoText>
          )}
        </div>
      </button>
    </li>
  )
}

export function ThreadList() {
  const threads = useSentinel((s) => s.threads)
  const civilians = useCivilians()
  const recommendations = useSentinel((s) => s.recommendations)
  const selectedThreadId = useSentinel((s) => s.selectedThreadId)
  const selectThread = useSentinel((s) => s.selectThread)

  const rankOf = new Map(recommendations.map((r, i) => [r.civilian_id, i + 1]))
  const crew = threads.find((t) => t.kind === 'crew')
  const residents = threads
    .filter((t) => t.kind === 'resident' && t.personId)
    .sort((a, b) => (rankOf.get(a.personId ?? '') ?? 99) - (rankOf.get(b.personId ?? '') ?? 99))

  return (
    <nav aria-label="Threads" className="flex w-44 shrink-0 flex-col border-r border-outline">
      <div className="flex h-12 shrink-0 items-center border-b border-outline px-4 text-12 font-medium text-on-surface-variant">Threads</div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {crew && <ThreadRow thread={crew} selected={crew.id === selectedThreadId} onSelect={selectThread} />}
        {residents.map((t) => (
          <ThreadRow
            key={t.id}
            thread={t}
            civilian={civilians.find((c) => c.entity_id === t.personId)}
            selected={t.id === selectedThreadId}
            onSelect={selectThread}
          />
        ))}
      </ul>
    </nav>
  )
}
