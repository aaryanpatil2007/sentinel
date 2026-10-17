import { useEffect, useRef } from 'react'
import type { Message } from '../../types'
import { MessageRow } from './MessageRow'

type Props = { messages: Message[]; ownFrom: 'resident' | 'responder' }

export function MessageList({ messages, ownFrom }: Props) {
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  if (messages.length === 0) {
    return <div className="min-h-0 flex-1 p-4 text-14 text-on-surface-variant">No messages yet.</div>
  }
  return (
    <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
      <ul className="space-y-1">
        {messages.map((m) => (
          <MessageRow key={m.id} message={m} own={m.from === ownFrom} />
        ))}
      </ul>
      <div ref={endRef} />
    </div>
  )
}
