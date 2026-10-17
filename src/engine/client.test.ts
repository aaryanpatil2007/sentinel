import { afterEach, describe, expect, it, vi } from 'vitest'
import { EngineError, REQUEST_TIMEOUT_MS, createEngineClient, rescueRouteId } from './client'

type Call = { url: string; init: RequestInit | undefined }

function fakeFetch(respond: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Call[] = []
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return respond(String(input), init)
  }) as typeof fetch
  return { calls, impl }
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

afterEach(() => vi.useRealTimers())

describe('createEngineClient', () => {
  it('GETs the incident events since a sequence number', async () => {
    const { calls, impl } = fakeFetch(() => json({ events: [{ seq: 3, timestamp: 't', event_type: 'hazard_added', payload: {} }] }))
    const events = await createEngineClient('http://engine', impl).events(2)
    expect(calls[0].url).toBe('http://engine/incident/events?since=2')
    expect(calls[0].init?.method).toBe('GET')
    expect(events).toHaveLength(1)
  })

  it('POSTs a civilian report with an id and JSON body', async () => {
    const { calls, impl } = fakeFetch(() => json({ civilian: {}, report: {}, priority: {} }))
    await createEngineClient('http://engine', impl).report('I am trapped', 'CIV_001')
    expect(calls[0].url).toBe('http://engine/civilians/report')
    expect(calls[0].init?.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ text: 'I am trapped', civilian_id: 'CIV_001' })
    expect(calls[0].init?.headers).toEqual({ 'Content-Type': 'application/json' })
  })

  it('names rescue routes per responder', async () => {
    const { calls, impl } = fakeFetch(() => json({ route_id: 'RESCUE_UNIT_ALPHA' }))
    await createEngineClient('http://engine', impl).computeRoute('UNIT_ALPHA', 'CIV_002')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ responder_id: 'UNIT_ALPHA', civilian_id: 'CIV_002', route_id: rescueRouteId('UNIT_ALPHA') })
    expect(rescueRouteId('UNIT_ALPHA')).toBe('RESCUE_UNIT_ALPHA')
  })

  it('returns null evacuation when the civilian has no location', async () => {
    const { impl } = fakeFetch(() => json({ status: 'no_location' }))
    expect(await createEngineClient('http://engine', impl).evacuation('CIV_009')).toBeNull()
  })

  it('unwraps prioritize recommendations', async () => {
    const { impl } = fakeFetch(() => json({ recommendations: [{ civilian_id: 'CIV_001' }] }))
    expect(await createEngineClient('http://engine', impl).prioritize()).toEqual([{ civilian_id: 'CIV_001' }])
  })

  it('throws EngineError with the HTTP status on a failed response', async () => {
    const { impl } = fakeFetch(() => json({ detail: 'civilian CIV_9 not found' }, 404))
    const err = await createEngineClient('http://engine', impl).advisory('CIV_9').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EngineError)
    expect((err as EngineError).status).toBe(404)
    expect((err as EngineError).message).toContain('404')
  })

  it('throws EngineError with null status when the engine is unreachable', async () => {
    const impl = (async () => {
      throw new TypeError('Failed to fetch')
    }) as typeof fetch
    const err = await createEngineClient('http://engine', impl).graph().catch((e: unknown) => e)
    expect(err).toBeInstanceOf(EngineError)
    expect((err as EngineError).status).toBeNull()
    expect((err as EngineError).message).toContain('unreachable')
  })

  it('times out slow requests', async () => {
    vi.useFakeTimers()
    const impl = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })) as typeof fetch
    const pending = createEngineClient('http://engine', impl).state().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    const err = await pending
    expect(err).toBeInstanceOf(EngineError)
    expect((err as EngineError).message).toContain('timed out')
  })
})
