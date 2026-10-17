import { motion } from 'framer-motion'
import { Info } from 'lucide-react'
import type { Message } from '../../types'
import { cn } from '../../lib/cn'
import { formatClock } from '../../lib/format'
import { STANDARD } from '../../lib/motion'
import { MonoText } from '../ui/MonoText'
import { QuickReplyChip } from '../ui/QuickReplyChip'

export function MessageRow({ message, own }: { message: Message; own: boolean }) {
  if (message.from === 'system') {
    return (
      <li className="flex items-center gap-2 px-3 py-1 text-12 text-on-surface-variant">
        <Info size={16} strokeWidth={1.75} aria-hidden />
        <span className="min-w-0 flex-1">{message.text}</span>
        <MonoText className="text-11">{formatClock(message.at)}</MonoText>
      </li>
    )
  }
  return (
    <motion.li initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={STANDARD} className={cn('rounded-8 px-3 py-2', own && 'bg-surface-container')}>
      <div className="flex items-baseline gap-2">
        <MonoText className="text-12 font-medium">{own ? 'You' : message.sender}</MonoText>
        <MonoText className="text-11 text-on-surface-variant">{formatClock(message.at)}</MonoText>
      </div>
      {message.quick ? (
        <div className="mt-1">
          <QuickReplyChip reply={message.quick} />
        </div>
      ) : (
        <p className="mt-0.5 whitespace-pre-wrap break-words text-14">{message.text}</p>
      )}
    </motion.li>
  )
}
