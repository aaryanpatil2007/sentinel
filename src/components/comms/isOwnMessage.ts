import { RESPONDER_SENDER } from '../../lib/labels'
import type { Message } from '../../types'

/** Only the viewer's own side is "You": every resident message on the resident side, but just E7 on the responder side. */
export function isOwnMessage(m: Pick<Message, 'from' | 'sender'>, ownFrom: 'resident' | 'responder'): boolean {
  return m.from === ownFrom && (ownFrom === 'resident' || m.sender === RESPONDER_SENDER)
}
