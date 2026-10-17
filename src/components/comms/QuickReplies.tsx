import { Accessibility, Check, LogOut, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { QuickReply } from '../../types'
import type { CivilianStatus } from '../../engine/derive'
import { cn } from '../../lib/cn'
import { QUICK_REPLY_LABEL } from '../../lib/labels'

const SENT_MS = 1500

const REPLIES: { reply: QuickReply; icon: LucideIcon; status: CivilianStatus; idle: string; active: string }[] = [
  { reply: 'out', icon: LogOut, status: 'evacuated', idle: 'border-success/40 text-success', active: 'bg-success/10' },
  { reply: 'trapped', icon: TriangleAlert, status: 'trapped', idle: 'border-error/40 text-error', active: 'bg-error/10' },
  { reply: 'cant-move', icon: Accessibility, status: 'immobile', idle: 'border-warning/40 text-warning', active: 'bg-warning/10' },
]

type Props = { current: CivilianStatus; onReply: (reply: QuickReply) => void }

export function QuickReplies({ current, onReply }: Props) {
  const [sent, setSent] = useState<QuickReply | null>(null)

  useEffect(() => {
    if (!sent) return
    const id = window.setTimeout(() => setSent(null), SENT_MS)
    return () => window.clearTimeout(id)
  }, [sent])

  return (
    <div role="group" aria-label="Quick replies" className="grid shrink-0 grid-cols-3 gap-2 border-t border-outline px-3 pt-3">
      {REPLIES.map(({ reply, icon: Icon, status, idle, active }) => {
        const isSent = sent === reply
        const ShownIcon = isSent ? Check : Icon
        return (
          <button
            key={reply}
            type="button"
            aria-pressed={current === status}
            onClick={() => {
              onReply(reply)
              setSent(reply)
            }}
            className={cn(
              'state-layer focus-ring flex h-12 items-center justify-center gap-2 rounded-8 border bg-surface text-14 font-semibold',
              idle,
              current === status && active,
            )}
          >
            <ShownIcon size={20} strokeWidth={1.75} aria-hidden />
            {isSent ? 'Sent' : QUICK_REPLY_LABEL[reply]}
          </button>
        )
      })}
    </div>
  )
}
