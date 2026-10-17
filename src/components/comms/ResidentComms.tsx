import { threadIdFor } from '../../data/scenarioThreads'
import { civilianStatus, placeLabel } from '../../engine/derive'
import { useSentinel } from '../../store'
import { useNodes, useThread, useViewedCivilian } from '../../store/selectors'
import { InlineConfirm } from '../ui/InlineConfirm'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { QuickReplies } from './QuickReplies'

export function ResidentComms() {
  const live = useSentinel((s) => s.engineStatus === 'live')
  const sendMessage = useSentinel((s) => s.sendMessage)
  const sendQuickReply = useSentinel((s) => s.sendQuickReply)
  const clearThread = useSentinel((s) => s.clearThread)
  const civilian = useViewedCivilian()
  const thread = useThread(threadIdFor(civilian?.entity_id ?? ''))
  const nodes = useNodes()

  if (!civilian || !thread) return <div className="flex-1 p-4 text-14 text-on-surface-variant">No resident selected.</div>

  return (
    <section aria-label="Messages with responders" className="flex min-w-0 flex-1 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-outline px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-16 font-semibold tracking-tightest">Responders · Engine 7</h2>
          <div className="flex items-center gap-2 text-12 text-on-surface-variant">
            <StatusDot tone={live ? 'safe' : 'moderate'} />
            {live ? 'Connected' : 'Offline · messages stay on this device'}
            <span aria-hidden>·</span>
            <MonoText>{placeLabel(civilian, nodes)}</MonoText>
          </div>
        </div>
        {thread.messages.length > 0 && <InlineConfirm label="Clear" prompt="Clear for everyone?" confirmLabel="Clear" onConfirm={() => clearThread(thread.id)} />}
      </header>
      <MessageList messages={thread.messages} ownFrom="resident" />
      <QuickReplies current={civilianStatus(civilian, nodes)} onReply={(reply) => sendQuickReply(civilian.entity_id, reply)} />
      <Composer placeholder="Message responders" divider={false} onSend={(text) => sendMessage(thread.id, 'resident', text)} />
    </section>
  )
}
