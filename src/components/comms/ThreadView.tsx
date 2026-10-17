import { useEffect } from 'react'
import { useSentinel } from '../../store'
import { placeLabel } from '../../engine/derive'
import { useEntity, useNodes, useThread } from '../../store/selectors'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { ThreadHeader } from './ThreadHeader'

export function ThreadView() {
  const threadId = useSentinel((s) => s.selectedThreadId)
  const sendMessage = useSentinel((s) => s.sendMessage)
  const clearThread = useSentinel((s) => s.clearThread)
  const markRead = useSentinel((s) => s.markRead)
  const focusNonce = useSentinel((s) => s.composerFocusNonce)
  const thread = useThread(threadId)
  const civilian = useEntity(thread?.personId ?? null)
  const nodes = useNodes()

  useEffect(() => {
    if (thread && thread.unread > 0) markRead(thread.id)
  }, [thread, markRead])

  if (!thread) return <div className="flex-1 p-4 text-14 text-on-surface-variant">Select a thread.</div>

  return (
    <section aria-label="Conversation" className="flex min-w-0 flex-1 flex-col">
      <ThreadHeader thread={thread} civilian={civilian} onClear={() => clearThread(thread.id)} />
      <MessageList messages={thread.messages} ownFrom="responder" />
      <Composer
        placeholder={civilian ? `Message ${placeLabel(civilian, nodes)}` : 'Message crew'}
        onSend={(text) => sendMessage(thread.id, 'responder', text)}
        focusNonce={focusNonce}
      />
    </section>
  )
}
