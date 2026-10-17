import { AnimatePresence, motion } from 'framer-motion'
import { Eye, MessageSquare, Truck, X } from 'lucide-react'
import { threadIdFor } from '../../data/scenarioThreads'
import { CIVILIAN_STATUS_LABEL, assignedResponder, civilianStatus, civilianTone, floorOf, peopleCount, placeLabel } from '../../engine/derive'
import { FLOOR_NAME } from '../../engine/types'
import { formatClock } from '../../lib/format'
import { RESPONDER_LABEL, REVIEW_PRIORITY_LABEL } from '../../lib/labels'
import { fadeDrop } from '../../lib/motion'
import { useSentinel } from '../../store'
import { lastResidentMessage, useEntity, useNodes, useResponders, useThread } from '../../store/selectors'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/IconButton'
import { MonoText } from '../ui/MonoText'
import { QuickReplyChip } from '../ui/QuickReplyChip'
import { StatusChip } from '../ui/StatusChip'
import { StatusDot } from '../ui/StatusDot'
import { STATUS_TONE } from '../ui/tone'

export function humanizeCondition(code: string): string {
  const words = code.replace(/_/g, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export function MarkerCard() {
  const selectedId = useSentinel((s) => s.selectedCivilianId)
  const routes = useSentinel((s) => s.snapshot?.routes)
  const live = useSentinel((s) => s.engineStatus === 'live')
  const pending = useSentinel((s) => s.pending)
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const selectThread = useSentinel((s) => s.selectThread)
  const requestComposerFocus = useSentinel((s) => s.requestComposerFocus)
  const setViewingAs = useSentinel((s) => s.setViewingAs)
  const setPerspective = useSentinel((s) => s.setPerspective)
  const assignResponder = useSentinel((s) => s.assignResponder)
  const civilian = useEntity(selectedId)
  const thread = useThread(selectedId ? threadIdFor(selectedId) : '')
  const nodes = useNodes()
  const responders = useResponders()
  const last = lastResidentMessage(thread)
  const isCivilian = civilian?.entity_type === 'civilian'

  return (
    <AnimatePresence>
      {civilian && isCivilian && (
        <motion.div key={civilian.entity_id} {...fadeDrop} className="absolute right-0 top-0 z-10 w-80 rounded-12 border border-outline bg-surface shadow-float">
          <div className="flex items-center gap-2 border-b border-outline py-2 pl-4 pr-2">
            <StatusDot tone={civilianTone(civilian, nodes)} />
            <span className="min-w-0 flex-1 truncate text-16 font-semibold tracking-tightest">{placeLabel(civilian, nodes)}</span>
            <StatusChip tone={STATUS_TONE[civilianStatus(civilian, nodes)]} label={CIVILIAN_STATUS_LABEL[civilianStatus(civilian, nodes)]} />
            <IconButton icon={X} label="Close" onClick={() => selectCivilian(null)} />
          </div>

          <dl className="grid grid-cols-[88px_1fr] gap-x-2 gap-y-2 px-4 py-3 text-12">
            <dt className="text-on-surface-variant">People</dt>
            <dd><MonoText className="text-14">{peopleCount(civilian)}</MonoText></dd>
            <dt className="text-on-surface-variant">Floor</dt>
            <dd>{(() => { const f = floorOf(civilian, nodes); return f ? FLOOR_NAME[f] : 'Unknown' })()} · <MonoText>{civilian.entity_id}</MonoText></dd>
            <dt className="text-on-surface-variant">Review</dt>
            <dd>
              {civilian.priority ? REVIEW_PRIORITY_LABEL[civilian.priority.priority] : 'Not triaged'}
              {civilian.priority && <MonoText className="ml-1 text-on-surface-variant">score {civilian.priority.score}</MonoText>}
            </dd>
            <dt className="text-on-surface-variant">Conditions</dt>
            <dd className="flex flex-wrap gap-1">
              {civilian.priority?.reported_conditions.length ? (
                civilian.priority.reported_conditions.map((c) => (
                  <span key={c} className="rounded-8 bg-surface-container-high px-2 py-0.5">{humanizeCondition(c)}</span>
                ))
              ) : (
                <span className="text-on-surface-variant">None reported</span>
              )}
            </dd>
            <dt className="text-on-surface-variant">Assigned</dt>
            <dd>{(() => { const r = assignedResponder(routes ?? [], civilian.entity_id); return r ? RESPONDER_LABEL[r] ?? r : 'No crew yet' })()}</dd>
          </dl>

          {civilian.flags.length > 0 && (
            <p className="mx-4 mb-3 text-12 text-on-surface-variant">{civilian.flags.join(' · ')}</p>
          )}

          {last && (
            <div className="mx-4 rounded-8 bg-surface-container p-3">
              <div className="flex items-center justify-between text-12 text-on-surface-variant">
                <span>Last message</span>
                <MonoText>{formatClock(last.at)}</MonoText>
              </div>
              <div className="mt-1">{last.quick ? <QuickReplyChip reply={last.quick} /> : <p className="text-14">{last.text}</p>}</div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 px-4 pt-3">
            {responders.map((r) => (
              <Button
                key={r.entity_id}
                size="sm"
                icon={Truck}
                disabled={!live || pending}
                title={live ? undefined : 'Engine offline'}
                onClick={() => void assignResponder(r.entity_id, civilian.entity_id)}
              >
                Assign {RESPONDER_LABEL[r.entity_id] ?? r.entity_id}
              </Button>
            ))}
          </div>
          <div className="flex gap-2 p-4">
            <Button
              variant="primary"
              size="sm"
              icon={MessageSquare}
              onClick={() => {
                selectThread(threadIdFor(civilian.entity_id))
                requestComposerFocus()
              }}
            >
              Message
            </Button>
            <Button
              size="sm"
              icon={Eye}
              onClick={() => {
                setViewingAs(civilian.entity_id)
                setPerspective('resident')
              }}
            >
              View as resident
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
