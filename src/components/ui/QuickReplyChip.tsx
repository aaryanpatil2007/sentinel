import type { QuickReply } from '../../types'
import { QUICK_REPLY_LABEL, QUICK_REPLY_TONE } from '../../lib/labels'
import { StatusChip } from './StatusChip'

export function QuickReplyChip({ reply }: { reply: QuickReply }) {
  return <StatusChip tone={QUICK_REPLY_TONE[reply]} label={QUICK_REPLY_LABEL[reply]} />
}
