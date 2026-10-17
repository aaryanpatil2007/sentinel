import { beforeEach, describe, expect, it } from 'vitest'
import scenario from '../data/scenario.json'
import { CAMERAS, CREW_THREAD_ID, seedThreads, threadIdFor } from '../data/scenarioThreads'
import { FakeEngine } from '../engine/fakeEngine'
import { ENGINE_FIXTURE } from '../engine/fixture'
import { setEngineClient } from '../engine/instance'
import type { Route } from '../engine/types'
import { emptyEngineData } from './engineSlice'
import { mergePersisted, useSentinel } from './index'
import { initialUi } from './uiSlice'

const state = () => useSentinel.getState()
const thread = (civilianId: string) => state().threads.find((t) => t.id === threadIdFor(civilianId))!
const recorded = (id: string) => ENGINE_FIXTURE.state.entities.find((e) => e.entity_id === id)!

let engine: FakeEngine

function freshStore(seeded = true) {
  localStorage.clear()
  engine = new FakeEngine({ seeded })
  setEngineClient(engine)
  useSentinel.setState({
    ...emptyEngineData(),
    engineStatus: 'connecting',
    engineError: null,
    pending: false,
    threads: seedThreads(Date.now()),
    ...initialUi(),
  })
}

beforeEach(() => freshStore())

describe('connect', () => {
  it('seeds an empty engine in scenario order and goes live', async () => {
    freshStore(false)
    await state().connect()
    expect(engine.callsTo('reset')).toHaveLength(1)
    expect(engine.callsTo('report').map((c) => c.args[0])).toEqual(scenario.residents.map((r) => r.text))
    expect(engine.callsTo('addResponder').map((c) => c.args[0])).toEqual(['UNIT_ALPHA', 'UNIT_BRAVO'])
    expect(engine.callsTo('ignite').map((c) => c.args[0])).toEqual(['F2_CORRIDOR_EAST'])
    expect(engine.callsTo('addHazard').map((c) => c.args)).toEqual([['smoke', 'F3_CORRIDOR_CENTER']])
    expect(engine.callsTo('computeRoute').map((c) => c.args)).toEqual([
      ['UNIT_ALPHA', ENGINE_FIXTURE.recommendations[0].civilian_id],
      ['UNIT_BRAVO', ENGINE_FIXTURE.recommendations[1].civilian_id],
    ])
    expect(state().engineStatus).toBe('live')
    expect(state().snapshot?.entities.filter((e) => e.entity_type === 'civilian')).toHaveLength(6)
  })

  it('does not reseed an engine that already has civilians', async () => {
    await state().connect()
    expect(engine.callsTo('reset')).toHaveLength(0)
    expect(state().engineStatus).toBe('live')
    expect(Object.keys(state().evacuations)).toHaveLength(6)
    expect(state().advisories[state().viewingAsId]).toBeDefined()
  })

  it('seeds once when connect runs twice at the same time (StrictMode)', async () => {
    freshStore(false)
    await Promise.all([state().connect(), state().connect()])
    expect(engine.callsTo('reset')).toHaveLength(1)
    expect(engine.callsTo('report')).toHaveLength(scenario.residents.length)
  })

  it('falls back to the recorded incident when the engine is down', async () => {
    engine.down = true
    await state().connect()
    expect(state().engineStatus).toBe('offline')
    expect(state().engineError).toContain('unreachable')
    expect(state().snapshot).toBe(ENGINE_FIXTURE.state)
    expect(state().graph).toBe(ENGINE_FIXTURE.graph)
  })

  it('keeps live data when the engine drops mid-demo', async () => {
    await state().connect()
    const live = state().snapshot
    engine.down = true
    await state().poll()
    expect(state().engineStatus).toBe('offline')
    expect(state().snapshot).toBe(live)
  })
})

describe('poll', () => {
  beforeEach(async () => {
    await state().connect()
  })

  it('refreshes only on world-changing events', async () => {
    const before = engine.callsTo('state').length
    engine.emit('advisory_drafted')
    engine.emit('rescue_prioritized')
    await state().poll()
    expect(engine.callsTo('state')).toHaveLength(before)
    engine.emit('hazard_added')
    await state().poll()
    expect(engine.callsTo('state')).toHaveLength(before + 1)
  })

  it('runs one poll at a time', async () => {
    const before = engine.callsTo('events').length
    await Promise.all([state().poll(), state().poll()])
    expect(engine.callsTo('events')).toHaveLength(before + 1)
  })

  it('posts a route-change message once per real change', async () => {
    const blocked: Route = { ...ENGINE_FIXTURE.evacuations.CIV_003!, status: 'unreachable' }
    engine.evacuationOverrides = { CIV_003: blocked }
    engine.emit('hazard_added')
    await state().poll()
    engine.emit('hazard_added')
    await state().poll()
    const notices = thread('CIV_003').messages.filter((m) => m.text === 'Route blocked · Shelter in place')
    expect(notices).toHaveLength(1)
    expect(notices[0].from).toBe('system')
  })
})

describe('engine actions', () => {
  beforeEach(async () => {
    await state().connect()
  })

  it('appends new reports to the civilian’s earlier report', async () => {
    expect(await state().reportCivilian('CIV_003', "I'm trapped.")).toBe(true)
    expect(engine.callsTo('report').at(-1)?.args).toEqual([`${recorded('CIV_003').report!.raw_text} I'm trapped.`, 'CIV_003'])
  })

  it('maps hazard tools to engine calls', async () => {
    await state().addHazard('fire', 'F3_CORRIDOR_EAST')
    await state().addHazard('blocked', 'F1_STAIR_A')
    expect(engine.callsTo('ignite').at(-1)?.args).toEqual(['F3_CORRIDOR_EAST'])
    expect(engine.callsTo('addHazard').at(-1)?.args).toEqual(['blocked', 'F1_STAIR_A'])
  })

  it('posts a simulated camera observation at the camera’s node', async () => {
    await state().simulateDetection(CAMERAS[0])
    const [obs] = engine.callsTo('observe').at(-1)!.args as [{ graph_node_id: string; type: string; camera_id: string }]
    expect(obs).toMatchObject({ graph_node_id: CAMERAS[0].nodeId, type: 'smoke', camera_id: CAMERAS[0].id })
  })

  it('refuses actions while offline', async () => {
    useSentinel.setState({ engineStatus: 'offline' })
    const before = engine.calls.length
    expect(await state().addHazard('smoke', 'F2_CORRIDOR_WEST')).toBe(false)
    expect(engine.calls).toHaveLength(before)
    expect(state().engineError).toContain('offline')
  })
})

describe('messages', () => {
  beforeEach(async () => {
    await state().connect()
  })

  it('reports resident free text to the engine and keeps it in the shared thread', async () => {
    state().setPerspective('resident')
    state().sendMessage(threadIdFor('CIV_003'), 'resident', 'The stairs are smoky')
    state().setPerspective('firefighter')
    expect(thread('CIV_003').messages.at(-1)).toMatchObject({ text: 'The stairs are smoky', sender: 'Studio 310', from: 'resident' })
    await Promise.resolve()
    expect(engine.callsTo('report').at(-1)?.args[1]).toBe('CIV_003')
  })

  it('does not report responder messages, ignores blanks, truncates long text', () => {
    const before = engine.callsTo('report').length
    state().sendMessage(threadIdFor('CIV_002'), 'responder', '   ')
    state().sendMessage(threadIdFor('CIV_002'), 'responder', 'x'.repeat(600))
    expect(thread('CIV_002').messages.at(-1)).toMatchObject({ sender: 'E7 · Reyes' })
    expect(thread('CIV_002').messages.at(-1)?.text).toHaveLength(500)
    expect(engine.callsTo('report')).toHaveLength(before)
  })

  it("moves a resident who taps I'm out to staging", async () => {
    state().sendQuickReply('CIV_003', 'out')
    expect(thread('CIV_003').messages.at(-1)).toMatchObject({ quick: 'out', text: "I'm out" })
    await Promise.resolve()
    expect(engine.callsTo('moveCivilian').at(-1)?.args).toEqual(['CIV_003', 'EXT_STAGING'])
  })

  it("reports I'm trapped with the triage phrase", async () => {
    state().sendQuickReply('CIV_005', 'trapped')
    await Promise.resolve()
    expect(String(engine.callsTo('report').at(-1)?.args[0])).toMatch(/I'm trapped\.$/)
  })

  it('still accepts a quick reply after the thread is cleared', () => {
    state().clearThread(threadIdFor('CIV_003'))
    expect(thread('CIV_003')).toMatchObject({ messages: [], unread: 0 })
    state().sendQuickReply('CIV_003', 'cant-move')
    expect(thread('CIV_003').messages).toHaveLength(1)
    expect(thread('CIV_003').unread).toBe(1)
  })
})

describe('selection and reset', () => {
  it('syncs civilian and thread selection', () => {
    state().selectCivilian('CIV_002')
    expect(state().selectedThreadId).toBe(threadIdFor('CIV_002'))
    expect(thread('CIV_002').unread).toBe(0)
    state().selectThread(CREW_THREAD_ID)
    expect(state().selectedCivilianId).toBeNull()
    state().selectThread(threadIdFor('CIV_004'))
    expect(state().selectedCivilianId).toBe('CIV_004')
  })

  it('resetDemo reseeds a live engine, restores threads and keeps the perspective', async () => {
    await state().connect()
    state().clearThread(threadIdFor('CIV_001'))
    state().setPerspective('resident')
    await state().resetDemo()
    expect(engine.callsTo('reset')).toHaveLength(1)
    expect(thread('CIV_001').messages.length).toBeGreaterThan(0)
    expect(state().perspective).toBe('resident')
  })

  it('falls back to scenario threads when saved data is corrupt', () => {
    const current = state()
    expect(mergePersisted(null, current)).toBe(current)
    expect(mergePersisted({ threads: 'nope' }, current)).toBe(current)
    const missingUnread = { threads: [{ id: 'crew', kind: 'crew', messages: [] }], perspective: 'resident', viewingAsId: 'CIV_001' }
    expect(mergePersisted(missingUnread, current)).toBe(current)
    const badMessage = { threads: [{ id: 'crew', kind: 'crew', unread: 0, messages: [{ id: 'm', text: 'hi' }] }], perspective: 'resident', viewingAsId: 'CIV_001' }
    expect(mergePersisted(badMessage, current)).toBe(current)
  })

  it('uses valid saved threads and view', () => {
    const saved = { threads: seedThreads(1), perspective: 'resident', viewingAsId: 'CIV_005' }
    const merged = mergePersisted(JSON.parse(JSON.stringify(saved)), state())
    expect(merged.perspective).toBe('resident')
    expect(merged.viewingAsId).toBe('CIV_005')
    expect(merged.threads).toHaveLength(7)
  })
})
