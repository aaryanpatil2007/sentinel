# Sentinel × Jacobs Hall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Sentinel into the frontend for the teammate's `sentinel_engine`, rendering Jacobs Hall in 3D with Firefighter and Resident perspectives over the engine's live incident state.

**Architecture:** The FastAPI engine (`sentinel_engine/`) owns the building graph, positions, hazards, routes, spread risk, triage and advisories. The React app polls it through a typed client (`src/engine/`), derives UI state with pure functions, and keeps only message threads and UI state locally. A three.js scene (`src/components/building3d/`) draws the building from engine coordinates plus a presentation layout, reusing the teammate demo's furniture and firefighter builders.

**Tech Stack:** Vite 5, React 18, TypeScript 5 strict, Tailwind 3, Framer Motion 11, lucide-react, Zustand 5, three 0.186.1, Vitest 2 + jsdom; Python 3.14 FastAPI engine with pytest.

**Spec:** `docs/superpowers/specs/2026-10-17-sentinel-design.md` — sections 2–5 plus **Revision 2** (R1–R6), which supersedes sections 6–12.

**Builds on:** Phase 1 plan `docs/superpowers/plans/2026-10-17-sentinel.md`. Its Tasks 1–2 are done and kept. Its Tasks 3–6 were implemented, then are replaced here. Several Jacobs tasks reuse Phase 1 code blocks by reference ("Phase 1 Task N, file X"). Those blocks are committed in that file; copy them verbatim, applying only the changes listed.

## Global Constraints

- Run with `npm install && npm run dev` (frontend only, offline snapshot) or `npm run demo` (engine + frontend). Engine setup: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`.
- Colors: ONLY surface #FBF9F6, surface-container #F3F1EE, surface-container-high #ECEAE7, on-surface #1C1B19, on-surface-variant #5F5E5A, outline #C8C6C2, primary #1F4E79, error #B3261E, warning #8A5A00, success #2E6B3F. No gradients. Opacity modifiers of these tokens are allowed. 3D materials use the same hexes (see `src/components/building3d/palette.ts`).
- Type: Inter for UI, JetBrains Mono for numbers, timestamps, coordinates, node/unit IDs, distances, call signs. Sizes 11/12/14/16/18/24 only. Weights 400/500/600 only. Sentence case.
- Spacing 8px grid, 4px icon gaps; panel padding 16, section gap 24. Radius 8 controls, 12 panels/cards, 999 only for status dots.
- Shadow (`shadow-float`) only on floating elements: marker card, dev popover.
- States via `.state-layer`; focus ring via `.focus-ring`. Icons lucide 16/20, `strokeWidth={1.75}`, labeled. Motion 200ms `cubic-bezier(0.2, 0, 0, 1)`; nothing bounces or scales past 1.
- Forbidden: emoji, glassmorphism, blur, purple/neon, gradient text, decorative illustrations, lorem ipsum, card drop shadows, AI chatbot.
- Immutability: never mutate state objects. Zustand 5 selectors must return existing references (never build arrays/objects inside a `useSentinel` selector); derive with `useMemo` or memoized helpers.
- Engine is the source of truth. Never persist engine data. Coordinates are `JACOBS_LOCAL` meters: x east 0–40, y north 0–20, floors B/F1/F2/F3 at elevation −4/0/4/8.
- Engine reads that emit events (`/civilians/{id}/advisory`, `/rescue/prioritize`) must never trigger a refresh.
- Teammate code: only the three endpoints in Task J1 may change in `sentinel_engine/`; `demo/` is read-only (import from it, never edit it).
- Commit messages: `<type>: <description>`, ending with a `Co-Authored-By:` trailer naming the model that wrote the commit.

## Review Focus

1. Engine down at startup or mid-demo → the app shows the recorded incident with an "Engine offline" banner, never a blank screen or crash loop. → Task J5 offline tests.
2. React StrictMode double-mount or overlapping polls must not seed the engine twice or run concurrent refreshes. → Task J5 single-flight tests.
3. A route-change or status-change system message must post once per real change, never on every poll. → Task J5 refresh-diff test.
4. Resident follow-up messages must not erase earlier reported conditions (the engine re-triages each report from scratch). → Task J5 report-accumulation test.
5. Stale or corrupt saved threads must fall back to the scenario threads. → Task J5 `mergePersisted` tests.

## File Map

```
sentinel_engine/state.py, api.py, tests/test_api.py      J1: reset, evacuation, civilian location
scripts/demo.mjs                                          J1: run engine + vite together
scripts/capture_engine_snapshot.py                        J3: records src/data/engine-snapshot.json
src/engine/types.ts        engine payload types
src/engine/client.ts       createEngineClient, EngineError, rescueRouteId
src/engine/events.ts       REFRESH_EVENT_TYPES, needsRefresh, latestSeq
src/engine/instance.ts     getEngineClient / setEngineClient
src/engine/fixture.ts      offline snapshot loader
src/engine/derive.ts       status, tone, place, instructions, route-change text
src/engine/fakeEngine.ts   in-memory EngineClient for tests
src/engine/useEngineSync.ts polling hook
src/data/scenario.json     seed residents, responders, hazards
src/data/scenarioThreads.ts seeded conversations, cameras
src/data/jacobsLayout.ts   presentation footprints + furnishings in JACOBS_LOCAL
src/data/engine-snapshot.json recorded engine output (generated)
src/types.ts               local UI types (rewritten)
src/store/                 engineSlice, commsSlice, uiSlice, events, index, selectors, types (rewritten)
src/components/building3d/ coords, palette, BuildingScene, layers, BuildingView3D
src/components/{ui,layout,map,comms}/  as Phase 1, retargeted to engine data
```

## Engine Contract Reference

Payload shapes are in `src/engine/types.ts` (Task J2) and `sentinel_engine/INTEGRATION.md`. Node ids per floor `f ∈ {B, F1, F2, F3}`: `f_STAIR_A` (5,10), `f_STAIR_B` (35,10), `f_ELEVATOR` (20,12), `f_CORRIDOR_WEST` (12,10), `f_CORRIDOR_CENTER` (20,10), `f_CORRIDOR_EAST` (28,10). Rooms (12,16)/(28,16): `B_STUDIO_10`, `B_METAL_SHOP`, `F1_STUDIO_110`, `F1_STUDIO_120`, `F2_STUDIO_210`, `F2_STUDIO_220`, `F3_STUDIO_310`, `F3_PROTOTYPING_LAB`. `F1_ENTRANCE_MAIN` (20,0), `F1_ENTRANCE_EAST` (35,0), `EXT_STAGING` (20,−10).

---

### Task J1: Engine endpoints and demo runner

**Files:**
- Modify: `sentinel_engine/state.py` (add `IncidentState.reset`)
- Modify: `sentinel_engine/api.py` (add `CivilianLocationIn` and three endpoints)
- Modify: `sentinel_engine/tests/test_api.py` (append tests)
- Create: `scripts/demo.mjs`
- Modify: `package.json` (scripts `engine`, `demo`, `engine:test`)

**Interfaces:**
- Consumes: existing `IncidentState`, `nearest_exit_route`, `_current_risk`, closure variables `incident` and `building` inside `create_app`.
- Produces: `POST /incident/reset → {"reset": true}`; `GET /civilians/{id}/evacuation → Route | {"status": "no_location"}` (404 unknown); `POST /civilians/location {civilian_id, graph_node_id} → Entity` (404 unknown civilian, 400 unknown node). npm scripts `engine`, `engine:test`, `demo`.

- [ ] **Step 1: Write the failing engine tests**

Append to `sentinel_engine/tests/test_api.py`:
```python


def _seed_310(client):
    body = {"text": "Studio 310, smoke is coming under the door."}
    return client.post("/civilians/report", json=body).json()["civilian"]["entity_id"]


def test_incident_reset_clears_everything(client):
    _seed_310(client)
    client.post("/spread/ignite", json={"node_id": "F2_CORRIDOR_EAST"})
    assert client.post("/incident/reset").json() == {"reset": True}
    state = client.get("/incident/state").json()
    assert state["entities"] == []
    assert state["hazards"] == []
    assert state["routes"] == []
    assert state["last_event_seq"] == 0
    assert client.get("/spread/prediction").json()["fire_nodes"] == []
    assert _seed_310(client) == "CIV_001"


def test_civilian_evacuation_returns_route_without_side_effects(client):
    cid = _seed_310(client)
    before = client.get("/incident/state").json()
    route = client.get(f"/civilians/{cid}/evacuation").json()
    assert route["route_id"] == f"EVAC_{cid}"
    assert route["status"] == "candidate"
    assert route["nodes"][0] == "F3_STUDIO_310"
    assert route["nodes"][-1] in {"F1_ENTRANCE_MAIN", "F1_ENTRANCE_EAST"}
    after = client.get("/incident/state").json()
    assert after["routes"] == []
    assert after["last_event_seq"] == before["last_event_seq"]


def test_civilian_evacuation_errors(client):
    assert client.get("/civilians/CIV_999/evacuation").status_code == 404
    cid = client.post("/civilians", json={}).json()["entity_id"]
    assert client.get(f"/civilians/{cid}/evacuation").json() == {"status": "no_location"}


def test_civilian_location_moves_civilian(client):
    cid = _seed_310(client)
    moved = client.post("/civilians/location",
                        json={"civilian_id": cid, "graph_node_id": "EXT_STAGING"}).json()
    assert moved["graph_node_id"] == "EXT_STAGING"
    assert moved["world_position"]["floor_id"] == "F1"
    missing = client.post("/civilians/location",
                          json={"civilian_id": "CIV_999", "graph_node_id": "EXT_STAGING"})
    assert missing.status_code == 404
    bad_node = client.post("/civilians/location",
                           json={"civilian_id": cid, "graph_node_id": "NOPE"})
    assert bad_node.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_api.py -q`
Expected: the 4 new tests FAIL (404/405 for the missing routes); existing tests pass.

- [ ] **Step 3: Implement the engine additions**

In `sentinel_engine/state.py`, add this method to `IncidentState` directly after `__init__`:
```python
    def reset(self) -> None:
        """Clear the incident in place; API handlers keep a reference to this object."""
        self.entities.clear()
        self.hazards.clear()
        self.routes.clear()
        self.events.clear()
        self._counters.clear()
```

In `sentinel_engine/api.py`, add after `class IgniteIn`:
```python
class CivilianLocationIn(BaseModel):
    civilian_id: str
    graph_node_id: str
```

In `sentinel_engine/api.py`, add inside `create_app`, directly after the `civilian_advisory` endpoint:
```python
    @app.get("/civilians/{civilian_id}/evacuation")
    def civilian_evacuation(civilian_id: str):
        civ = incident.get_entity(civilian_id)
        if civ is None or civ["entity_type"] != "civilian":
            raise HTTPException(404, f"civilian {civilian_id} not found")
        if not civ.get("graph_node_id"):
            return {"status": "no_location"}
        return nearest_exit_route(building, civ["graph_node_id"],
                                  hazards=incident.get_hazards(),
                                  risk=_current_risk(app),
                                  route_id=f"EVAC_{civilian_id}")

    @app.post("/civilians/location")
    def civilian_location(body: CivilianLocationIn):
        civ = incident.get_entity(body.civilian_id)
        if civ is None or civ["entity_type"] != "civilian":
            raise HTTPException(404, f"civilian {body.civilian_id} not found")
        if body.graph_node_id not in building.nodes:
            raise HTTPException(400, f"unknown node {body.graph_node_id}")
        return incident.update_entity_location(body.civilian_id,
                                               graph_node_id=body.graph_node_id,
                                               source="civilian_report",
                                               position_status="reported")
```

In `sentinel_engine/api.py`, add inside `create_app`, directly before the `incident_state` endpoint:
```python
    @app.post("/incident/reset")
    def incident_reset():
        incident.reset()
        app.state.fire_nodes.clear()
        return {"reset": True}
```

- [ ] **Step 4: Run engine tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests -q`
Expected: all pass (61 existing + 4 new = 65).

- [ ] **Step 5: Add the demo runner and npm scripts**

`scripts/demo.mjs`:
```js
// Starts the Sentinel engine (uvicorn) and the Vite dev server together.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'

const uvicorn = '.venv/bin/uvicorn'
if (!existsSync(uvicorn)) {
  console.error('Engine not installed. Run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt')
  process.exit(1)
}

const children = [
  spawn(uvicorn, ['sentinel_engine.api:app', '--port', '8787'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit' }),
]

const stop = () => {
  for (const child of children) child.kill('SIGTERM')
  process.exit(0)
}
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
for (const child of children) child.on('exit', (code) => code && stop())
```

In `package.json` `scripts`, add:
```json
    "engine": ".venv/bin/uvicorn sentinel_engine.api:app --port 8787",
    "engine:test": ".venv/bin/python -m pytest sentinel_engine/tests -q",
    "demo": "node scripts/demo.mjs",
```

- [ ] **Step 6: Verify**

Run: `npm run engine:test && npm test && npm run typecheck`
Expected: 65 engine tests pass; frontend tests and typecheck unchanged and passing.

- [ ] **Step 7: Commit**

```bash
git add sentinel_engine/state.py sentinel_engine/api.py sentinel_engine/tests/test_api.py scripts/demo.mjs package.json
git commit -m "feat: add engine reset, civilian evacuation and civilian location endpoints"
```
(append the Co-Authored-By trailer)

---

### Task J2: Engine types, client and event filter

**Files:**
- Create: `src/engine/types.ts`, `src/engine/client.ts`, `src/engine/events.ts`, `src/engine/instance.ts`
- Test: `src/engine/client.test.ts`, `src/engine/events.test.ts`

**Interfaces:**
- Consumes: nothing from the app.
- Produces: all engine types below; `createEngineClient(baseUrl?, fetchImpl?) → EngineClient`; `EngineError { status: number | null }`; `DEFAULT_ENGINE_URL`; `REQUEST_TIMEOUT_MS = 4000`; `rescueRouteId(responderId)`; `REFRESH_EVENT_TYPES`, `needsRefresh(events)`, `latestSeq(events, current)`; `getEngineClient()`, `setEngineClient(client)`.

- [ ] **Step 1: Write the types**

`src/engine/types.ts`:
```ts
/** Payload types for sentinel_engine (see sentinel_engine/INTEGRATION.md). */
export type FloorId = 'B' | 'F1' | 'F2' | 'F3'
/** Top to bottom, the order floors are listed and stacked. */
export const FLOOR_IDS: readonly FloorId[] = ['F3', 'F2', 'F1', 'B']
export const FLOOR_ELEVATION: Record<FloorId, number> = { B: -4, F1: 0, F2: 4, F3: 8 }
export const FLOOR_NAME: Record<FloorId, string> = { B: 'Basement', F1: 'Floor 1', F2: 'Floor 2', F3: 'Floor 3' }

export type WorldPosition = { x: number; y: number; z: number; floor_id: FloorId; coordinate_frame: string }

export type NodeType = 'room' | 'corridor' | 'stairs' | 'elevator' | 'entrance' | 'staging'
export type GraphNode = { node_id: string; floor_id: FloorId; node_type: NodeType; label: string; x: number; y: number; z: number }
export type GraphEdge = { edge_id: string; from_node: string; to_node: string; distance_m: number; edge_type: string }
export type BuildingGraph = { nodes: GraphNode[]; edges: GraphEdge[] }

export type ReviewPriority = 'urgent_review' | 'priority_review' | 'standard_review'
export type ResolvedLocation = { node_id: string; floor_id: FloorId; match_type: string; matched_text: string; conflict: string | null }
export type CivilianReport = {
  raw_text: string
  location: ResolvedLocation | null
  people_count: number
  mobility_limited: boolean
  unconscious: boolean
  smoke_reported: boolean
  fire_reported: boolean
  exits_blocked: boolean
  unknowns: string[]
}
export type TriagePriority = {
  priority: ReviewPriority
  score: number
  reported_conditions: string[]
  reason: string
  requires_responder_review: boolean
  flags: string[]
}

export type EntityType = 'civilian' | 'responder' | 'detected_person'
export type Entity = {
  entity_id: string
  entity_type: EntityType
  name: string | null
  world_position: WorldPosition | null
  graph_node_id: string | null
  source: string
  position_status: string
  last_updated: string
  report: CivilianReport | null
  priority: TriagePriority | null
  flags: string[]
}

export type HazardType = 'fire' | 'smoke' | 'blocked'
export type Hazard = {
  hazard_id: string
  hazard_type: HazardType
  node_id: string | null
  edge_id: string | null
  verified: boolean
  source: string
  description: string
  created_at: string
}

export type RouteStep = { instruction: string; to_node: string; waypoint: WorldPosition; distance_m: number; bearing_degrees: number }
export type Route = {
  route_id: string
  status: 'candidate' | 'unreachable'
  start_node: string
  destination_node: string
  nodes: string[]
  edge_ids: string[]
  polyline: WorldPosition[]
  steps: RouteStep[]
  total_distance_m: number | null
  total_cost: number | null
  hazards_considered: string[]
  assumptions: string[]
  requires_command_approval: boolean
  unreachable_reason: string | null
  alternate?: Route | null
  meta?: { responder_id: string | null; civilian_id: string | null }
}

export type IncidentSnapshot = {
  building_id: string
  coordinate_frame: string
  timestamp: string
  entities: Entity[]
  hazards: Hazard[]
  routes: Route[]
  last_event_seq: number
}
export type SpreadPrediction = { fire_nodes: string[]; horizon_minutes: number; method: string; risk: Record<string, number>; provenance: string }
export type Recommendation = {
  civilian_id: string
  priority: ReviewPriority
  score: number
  reason: string
  flags: string[]
  nearest_responder_id: string | null
  route_status: 'candidate' | 'unreachable'
  estimated_cost: number | null
  requires_command_approval: boolean
}
export type Advisory = {
  civilian_id: string
  message: string
  requires_command_approval: boolean
  generated_at: string
  based_on: { hazard_ids: string[]; route_id: string | null; responder_en_route: boolean }
}
export type EngineEvent = { seq: number; timestamp: string; event_type: string; payload: Record<string, unknown> }
export type ReportResult = { civilian: Entity; report: CivilianReport; priority: TriagePriority }
export type ObservationInput = {
  observation_id: string
  type: 'fire' | 'smoke' | 'person'
  graph_node_id: string
  world_position: WorldPosition
  camera_id: string
  confidence: number
}
```

- [ ] **Step 2: Write the failing tests**

`src/engine/client.test.ts`:
```ts
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
```

`src/engine/events.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import type { EngineEvent } from './types'
import { latestSeq, needsRefresh } from './events'

const ev = (seq: number, event_type: string): EngineEvent => ({ seq, timestamp: 't', event_type, payload: {} })

describe('engine events', () => {
  it('refreshes on world-changing events', () => {
    expect(needsRefresh([ev(1, 'hazard_added')])).toBe(true)
    expect(needsRefresh([ev(1, 'route_updated')])).toBe(true)
    expect(needsRefresh([ev(1, 'civilian_report')])).toBe(true)
  })

  it('ignores events emitted by the app’s own reads', () => {
    expect(needsRefresh([ev(1, 'advisory_drafted'), ev(2, 'rescue_prioritized')])).toBe(false)
    expect(needsRefresh([])).toBe(false)
  })

  it('tracks the highest sequence number', () => {
    expect(latestSeq([ev(4, 'a'), ev(7, 'b'), ev(5, 'c')], 3)).toBe(7)
    expect(latestSeq([], 9)).toBe(9)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/engine`
Expected: FAIL — `./client` and `./events` not found.

- [ ] **Step 4: Implement client, events and instance**

`src/engine/client.ts`:
```ts
import type {
  Advisory,
  BuildingGraph,
  EngineEvent,
  Entity,
  Hazard,
  HazardType,
  IncidentSnapshot,
  ObservationInput,
  Recommendation,
  ReportResult,
  Route,
  SpreadPrediction,
} from './types'

export const DEFAULT_ENGINE_URL = 'http://localhost:8787'
export const REQUEST_TIMEOUT_MS = 4000

export class EngineError extends Error {
  readonly status: number | null
  constructor(message: string, status: number | null) {
    super(message)
    this.name = 'EngineError'
    this.status = status
  }
}

export const rescueRouteId = (responderId: string) => `RESCUE_${responderId}`

export type EngineClient = {
  graph(): Promise<BuildingGraph>
  state(): Promise<IncidentSnapshot>
  events(since: number): Promise<EngineEvent[]>
  prediction(): Promise<SpreadPrediction>
  prioritize(): Promise<Recommendation[]>
  evacuation(civilianId: string): Promise<Route | null>
  advisory(civilianId: string): Promise<Advisory>
  reset(): Promise<void>
  report(text: string, civilianId?: string): Promise<ReportResult>
  moveCivilian(civilianId: string, nodeId: string): Promise<Entity>
  addResponder(responderId: string, name: string, nodeId: string): Promise<Entity>
  addHazard(hazardType: HazardType, nodeId: string): Promise<Hazard>
  removeHazard(hazardId: string): Promise<void>
  ignite(nodeId: string): Promise<void>
  computeRoute(responderId: string, civilianId: string): Promise<Route>
  observe(observation: ObservationInput): Promise<void>
}

type Method = 'GET' | 'POST' | 'DELETE'

export function createEngineClient(baseUrl: string = DEFAULT_ENGINE_URL, fetchImpl: typeof fetch = fetch): EngineClient {
  async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetchImpl(`${baseUrl}${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new EngineError(`${method} ${path} failed (${res.status})${detail ? `: ${detail}` : ''}`, res.status)
      }
      return (await res.json()) as T
    } catch (err) {
      if (err instanceof EngineError) throw err
      const reason = err instanceof Error && err.name === 'AbortError' ? 'timed out' : 'unreachable'
      throw new EngineError(`${method} ${path} ${reason}`, null)
    } finally {
      clearTimeout(timer)
    }
  }

  const civ = (id: string) => `/civilians/${encodeURIComponent(id)}`

  return {
    graph: () => request('GET', '/building/graph'),
    state: () => request('GET', '/incident/state'),
    events: async (since) => (await request<{ events: EngineEvent[] }>('GET', `/incident/events?since=${since}`)).events,
    prediction: () => request('GET', '/spread/prediction'),
    prioritize: async () => (await request<{ recommendations: Recommendation[] }>('POST', '/rescue/prioritize')).recommendations,
    evacuation: async (id) => {
      const result = await request<Route | { status: 'no_location' }>('GET', `${civ(id)}/evacuation`)
      return 'route_id' in result ? result : null
    },
    advisory: (id) => request('GET', `${civ(id)}/advisory`),
    reset: async () => {
      await request('POST', '/incident/reset')
    },
    report: (text, civilianId) => request('POST', '/civilians/report', civilianId ? { text, civilian_id: civilianId } : { text }),
    moveCivilian: (civilianId, nodeId) => request('POST', '/civilians/location', { civilian_id: civilianId, graph_node_id: nodeId }),
    addResponder: (responderId, name, nodeId) => request('POST', '/responders', { responder_id: responderId, name, graph_node_id: nodeId }),
    addHazard: (hazardType, nodeId) => request('POST', '/hazards', { hazard_type: hazardType, node_id: nodeId, verified: true, source: 'responder_report' }),
    removeHazard: async (id) => {
      await request('DELETE', `/hazards/${encodeURIComponent(id)}`)
    },
    ignite: async (nodeId) => {
      await request('POST', '/spread/ignite', { node_id: nodeId })
    },
    computeRoute: (responderId, civilianId) =>
      request('POST', '/routes/compute', { responder_id: responderId, civilian_id: civilianId, route_id: rescueRouteId(responderId) }),
    observe: async (observation) => {
      await request('POST', '/observations', { ...observation, source: 'simulated_camera', position_status: 'simulated', provenance: 'simulated' })
    },
  }
}
```

`src/engine/events.ts`:
```ts
import type { EngineEvent } from './types'

/** Event types that change what the app shows. advisory_drafted and rescue_prioritized are emitted by the app's own reads. */
export const REFRESH_EVENT_TYPES: ReadonlySet<string> = new Set([
  'entity_registered',
  'entity_location_updated',
  'civilian_report',
  'observation_ingested',
  'hazard_added',
  'hazard_removed',
  'route_computed',
  'route_updated',
])

export function needsRefresh(events: EngineEvent[]): boolean {
  return events.some((e) => REFRESH_EVENT_TYPES.has(e.event_type))
}

export function latestSeq(events: EngineEvent[], current: number): number {
  return events.reduce((max, e) => Math.max(max, e.seq), current)
}
```

`src/engine/instance.ts`:
```ts
import { DEFAULT_ENGINE_URL, createEngineClient, type EngineClient } from './client'

const baseUrl = import.meta.env.VITE_ENGINE_URL ?? DEFAULT_ENGINE_URL
let client: EngineClient = createEngineClient(baseUrl)

export function getEngineClient(): EngineClient {
  return client
}

/** Swaps the client (tests use an in-memory fake). */
export function setEngineClient(next: EngineClient): void {
  client = next
}
```

Add to `src/vite-env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly VITE_ENGINE_URL?: string
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/engine && npm run typecheck`
Expected: PASS (11 tests); `tsc` clean.

- [ ] **Step 6: Commit**

```bash
git add src/engine src/vite-env.d.ts
git commit -m "feat: add typed sentinel engine client and event filter"
```
(append the Co-Authored-By trailer)

---
### Task J3: Scenario, recorded snapshot and presentation layout

**Files:**
- Create: `src/data/scenario.json`, `src/data/scenarioThreads.ts`, `src/data/jacobsLayout.ts`, `scripts/capture_engine_snapshot.py`, `src/engine/fixture.ts`
- Generate: `src/data/engine-snapshot.json` (by running the capture script; commit the output)
- Test: `src/data/jacobsLayout.test.ts`, `src/data/scenario.test.ts`

**Interfaces:**
- Consumes: engine endpoints (J1); engine types (J2); existing `Message`/`Thread` types in `src/types.ts`; `QUICK_REPLY_LABEL`, `RESPONDER_SENDER`, `SYSTEM_SENDER` in `src/lib/labels.ts`.
- Produces:
  - `scenario.json`: `{ defaultResidentId, residents: [{text}], responders: [{id, name, node}], ignite: [node], hazards: [{type, node}] }`
  - `scenarioThreads.ts`: `CREW_THREAD_ID = 'crew'`, `threadIdFor(civilianId)`, `DEFAULT_RESIDENT_ID = 'CIV_003'`, `seedThreads(now): Thread[]`, `type CameraSpec = { id; label; nodeId; status: 'live' | 'no-signal' }`, `CAMERAS: CameraSpec[]`
  - `jacobsLayout.ts`: `SHELL`, `type FootprintKind`, `type Footprint`, `FOOTPRINTS`, `ENTRANCES`, `type FurnishingSpec`, `FURNISHINGS`, `footprintFor(nodeId)`, `contains(footprint, x, y)`
  - `fixture.ts`: `type EngineFixture`, `ENGINE_FIXTURE`

- [ ] **Step 1: Write the scenario**

`src/data/scenario.json`:
```json
{
  "defaultResidentId": "CIV_003",
  "residents": [
    { "text": "I'm in Studio 210 on the second floor. There's smoke outside and my friend can't walk." },
    { "text": "We're trapped in the Metal Shop in the basement, three of us, there's fire by the door." },
    { "text": "Studio 310, smoke is coming under the door." },
    { "text": "Advanced Prototyping Lab, two people, we can't get out." },
    { "text": "I'm in Studio 110 and I smell smoke." },
    { "text": "Studio 120, I use a wheelchair." }
  ],
  "responders": [
    { "id": "UNIT_ALPHA", "name": "Alpha", "node": "EXT_STAGING" },
    { "id": "UNIT_BRAVO", "name": "Bravo", "node": "EXT_STAGING" }
  ],
  "ignite": ["F2_CORRIDOR_EAST"],
  "hazards": [{ "type": "smoke", "node": "F3_CORRIDOR_CENTER" }]
}
```

- [ ] **Step 2: Write and run the snapshot capture**

`scripts/capture_engine_snapshot.py`:
```python
"""Record a seeded engine incident to src/data/engine-snapshot.json (the app's offline fallback).

Run from the repo root:  PYTHONPATH=. .venv/bin/python scripts/capture_engine_snapshot.py
Replays the same seed sequence as the app's engine slice (seed()).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from sentinel_engine.api import create_app

ROOT = Path(__file__).resolve().parent.parent
SCENARIO = json.loads((ROOT / "src/data/scenario.json").read_text())
OUT = ROOT / "src/data/engine-snapshot.json"


def seed(client: TestClient) -> None:
    client.post("/incident/reset")
    for resident in SCENARIO["residents"]:
        client.post("/civilians/report", json={"text": resident["text"]})
    for responder in SCENARIO["responders"]:
        client.post("/responders", json={"responder_id": responder["id"],
                                         "name": responder["name"],
                                         "graph_node_id": responder["node"]})
    for node in SCENARIO["ignite"]:
        client.post("/spread/ignite", json={"node_id": node})
    for hazard in SCENARIO["hazards"]:
        client.post("/hazards", json={"hazard_type": hazard["type"], "node_id": hazard["node"],
                                      "verified": True, "source": "responder_report"})
    recommendations = client.post("/rescue/prioritize").json()["recommendations"]
    for responder, rec in zip(SCENARIO["responders"], recommendations):
        client.post("/routes/compute", json={"responder_id": responder["id"],
                                             "civilian_id": rec["civilian_id"],
                                             "route_id": f"RESCUE_{responder['id']}"})


def main() -> None:
    client = TestClient(create_app())
    seed(client)
    state = client.get("/incident/state").json()
    civilians = [e["entity_id"] for e in state["entities"] if e["entity_type"] == "civilian"]
    evacuations = {}
    for cid in civilians:
        route = client.get(f"/civilians/{cid}/evacuation").json()
        evacuations[cid] = route if "route_id" in route else None
    snapshot = {
        "graph": client.get("/building/graph").json(),
        "prediction": client.get("/spread/prediction").json(),
        "recommendations": client.post("/rescue/prioritize").json()["recommendations"],
        "evacuations": evacuations,
        "advisories": {cid: client.get(f"/civilians/{cid}/advisory").json() for cid in civilians},
        "state": client.get("/incident/state").json(),
    }
    OUT.write_text(json.dumps(snapshot, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(civilians)} civilians")


if __name__ == "__main__":
    main()
```

Run: `PYTHONPATH=. .venv/bin/python scripts/capture_engine_snapshot.py`
Expected: `wrote src/data/engine-snapshot.json: 6 civilians` (a Starlette deprecation warning on stderr is acceptable).

`src/engine/fixture.ts`:
```ts
import raw from '../data/engine-snapshot.json'
import type { Advisory, BuildingGraph, IncidentSnapshot, Recommendation, Route, SpreadPrediction } from './types'

/** A real engine incident recorded by scripts/capture_engine_snapshot.py, shown when the engine is offline. */
export type EngineFixture = {
  graph: BuildingGraph
  state: IncidentSnapshot
  prediction: SpreadPrediction
  recommendations: Recommendation[]
  evacuations: Record<string, Route | null>
  advisories: Record<string, Advisory>
}

export const ENGINE_FIXTURE = raw as unknown as EngineFixture
```

- [ ] **Step 3: Write the failing tests**

`src/data/scenario.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ENGINE_FIXTURE } from '../engine/fixture'
import scenario from './scenario.json'
import { CAMERAS, CREW_THREAD_ID, DEFAULT_RESIDENT_ID, seedThreads, threadIdFor } from './scenarioThreads'

const NOW = new Date(2026, 9, 17, 14, 30, 0).getTime()
const civilians = ENGINE_FIXTURE.state.entities.filter((e) => e.entity_type === 'civilian')
const nodeIds = new Set(ENGINE_FIXTURE.graph.nodes.map((n) => n.node_id))

describe('scenario and recorded snapshot', () => {
  it('records one civilian per scenario resident, in order', () => {
    expect(civilians.map((c) => c.entity_id)).toEqual(scenario.residents.map((_, i) => `CIV_00${i + 1}`))
    expect(civilians.map((c) => c.report?.raw_text)).toEqual(scenario.residents.map((r) => r.text))
  })

  it('places every scenario civilian in a room', () => {
    expect(civilians.map((c) => c.graph_node_id)).toEqual([
      'F2_STUDIO_210', 'B_METAL_SHOP', 'F3_STUDIO_310', 'F3_PROTOTYPING_LAB', 'F1_STUDIO_110', 'F1_STUDIO_120',
    ])
  })

  it('assigns both responders a rescue route', () => {
    expect(ENGINE_FIXTURE.state.routes.map((r) => r.route_id).sort()).toEqual(['RESCUE_UNIT_ALPHA', 'RESCUE_UNIT_BRAVO'])
  })

  it('records an evacuation route for every civilian', () => {
    for (const c of civilians) expect(ENGINE_FIXTURE.evacuations[c.entity_id]?.route_id).toBe(`EVAC_${c.entity_id}`)
  })

  it('defaults the resident view to a recorded civilian', () => {
    expect(DEFAULT_RESIDENT_ID).toBe(scenario.defaultResidentId)
    expect(civilians.some((c) => c.entity_id === DEFAULT_RESIDENT_ID)).toBe(true)
  })

  it('pins cameras to real graph nodes', () => {
    for (const cam of CAMERAS) expect(nodeIds.has(cam.nodeId)).toBe(true)
    expect(CAMERAS.filter((c) => c.status === 'no-signal')).toHaveLength(1)
  })
})

describe('seedThreads', () => {
  const threads = seedThreads(NOW)

  it('creates the crew channel and one thread per scenario civilian', () => {
    expect(threads[0].id).toBe(CREW_THREAD_ID)
    expect(threads.slice(1).map((t) => t.personId)).toEqual(civilians.map((c) => c.entity_id))
    for (const c of civilians) expect(threads.find((t) => t.id === threadIdFor(c.entity_id))).toBeDefined()
  })

  it('opens each resident thread with that resident’s report', () => {
    for (const [i, t] of threads.slice(1).entries()) {
      expect(t.messages[0]).toMatchObject({ from: 'resident', text: scenario.residents[i].text })
      expect(t.messages.length).toBeGreaterThanOrEqual(6)
      expect(t.messages.length).toBeLessThanOrEqual(10)
    }
  })

  it('timestamps messages in order and never in the future', () => {
    for (const t of threads) {
      const times = t.messages.map((m) => m.at)
      expect([...times].sort((a, b) => a - b)).toEqual(times)
      expect(Math.max(...times)).toBeLessThanOrEqual(NOW)
    }
  })
})
```

`src/data/jacobsLayout.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ENGINE_FIXTURE } from '../engine/fixture'
import { ENTRANCES, FOOTPRINTS, FURNISHINGS, SHELL, contains, footprintFor } from './jacobsLayout'

const DRAWN_TYPES = new Set(['room', 'corridor', 'stairs', 'elevator', 'staging'])
const nodes = ENGINE_FIXTURE.graph.nodes

describe('jacobsLayout', () => {
  it('gives every drawn engine node a footprint that contains it', () => {
    for (const n of nodes.filter((node) => DRAWN_TYPES.has(node.node_type))) {
      const fp = footprintFor(n.node_id)
      expect(fp, n.node_id).toBeDefined()
      expect(fp?.floor, n.node_id).toBe(n.floor_id)
      expect(fp && contains(fp, n.x, n.y), n.node_id).toBe(true)
    }
  })

  it('only references real nodes', () => {
    const ids = new Set(nodes.map((n) => n.node_id))
    for (const fp of FOOTPRINTS) if (fp.nodeId) expect(ids.has(fp.nodeId), fp.id).toBe(true)
    for (const e of ENTRANCES) expect(ids.has(e.nodeId)).toBe(true)
  })

  it('keeps building footprints inside the shell', () => {
    for (const fp of FOOTPRINTS.filter((f) => f.kind !== 'staging')) {
      expect(fp.x0 >= SHELL.x0 && fp.x1 <= SHELL.x1 && fp.y0 >= SHELL.y0 && fp.y1 <= SHELL.y1, fp.id).toBe(true)
    }
  })

  it('keeps every furnishing inside its room', () => {
    for (const f of FURNISHINGS) {
      const room = footprintFor(f.nodeId)
      expect(room, f.id).toBeDefined()
      if (!room) continue
      expect(contains(room, f.x - f.w / 2, f.y - f.d / 2) && contains(room, f.x + f.w / 2, f.y + f.d / 2), f.id).toBe(true)
    }
  })

  it('does not overlap footprints on the same floor', () => {
    const area = FOOTPRINTS.filter((f) => f.kind !== 'staging')
    for (const a of area) {
      for (const b of area) {
        if (a === b || a.floor !== b.floor) continue
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
        expect(overlap, `${a.id} × ${b.id}`).toBe(false)
      }
    }
  })
})
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- src/data/scenario.test.ts src/data/jacobsLayout.test.ts`
Expected: FAIL — `./scenarioThreads` and `./jacobsLayout` not found.

- [ ] **Step 5: Implement the seeded threads and cameras**

`src/data/scenarioThreads.ts`:
```ts
import type { MessageFrom, QuickReply, Thread } from '../types'
import { QUICK_REPLY_LABEL, RESPONDER_SENDER, SYSTEM_SENDER } from '../lib/labels'
import scenario from './scenario.json'

export const CREW_THREAD_ID = 'crew'
export const DEFAULT_RESIDENT_ID = scenario.defaultResidentId
export const threadIdFor = (civilianId: string) => `thread-${civilianId}`

export type CameraSpec = { id: string; label: string; nodeId: string; status: 'live' | 'no-signal' }

export const CAMERAS: CameraSpec[] = [
  { id: 'CAM_F2_EAST', label: 'F2 east corridor', nodeId: 'F2_CORRIDOR_EAST', status: 'live' },
  { id: 'CAM_F3_WEST', label: 'F3 west stair', nodeId: 'F3_STAIR_A', status: 'live' },
  { id: 'CAM_F1_LOBBY', label: 'Main lobby', nodeId: 'F1_CORRIDOR_CENTER', status: 'live' },
  { id: 'CAM_B_EAST', label: 'Basement east', nodeId: 'B_CORRIDOR_EAST', status: 'no-signal' },
]

const MIN = 60_000

type LineOptions = { quick?: QuickReply; sender?: string }
type Line = [from: MessageFrom, text: string, minutesAgo: number, options?: LineOptions]

/** Sender shown for each scenario resident, matching the room the engine resolves. */
const RESIDENT_PLACES = ['Studio 210', 'Metal Shop', 'Studio 310', 'Advanced Prototyping Lab', 'Studio 110', 'Studio 120']

const CREW: Line[] = [
  ['responder', 'E7 on scene at Jacobs Hall. Smoke showing from the second floor, east side.', 14, { sender: 'E7 · Reyes' }],
  ['responder', 'BC2 has command. Staging on Ridge Road at the main entrance.', 13, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Alpha, interior search via the east stair. Bravo, west stair.', 12, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Copy. Alpha entering with two.', 11, { sender: 'E7 · Reyes' }],
  ['responder', 'Fire confirmed in the F2 east corridor. Doors to 220 are hot.', 9, { sender: 'L3 · Okafor' }],
  ['responder', 'Smoke layering on F3 center corridor. Visibility under 3 meters.', 8, { sender: 'L3 · Okafor' }],
  ['responder', 'Three reported trapped in the metal shop, basement. Alpha, that is yours.', 6, { sender: 'BC2 · Lindqvist' }],
  ['responder', 'Bravo heading for Studio 210, one non-ambulatory.', 4, { sender: 'E7 · Reyes' }],
  ['responder', 'Studio 110 occupant self-evacuating through the lobby.', 3, { sender: 'L3 · Okafor' }],
  ['responder', 'Engine is predicting spread toward the F2 west corridor. Watch the west stair.', 2, { sender: 'BC2 · Lindqvist' }],
]

const RESIDENTS: { lines: Line[]; unread: number }[] = [
  {
    unread: 2,
    lines: [
      ['resident', scenario.residents[0].text, 13],
      ['responder', 'We have you in Studio 210. Keep the door closed and stay low.', 12],
      ['resident', 'My friend broke her ankle this morning. She cannot do stairs.', 11],
      ['system', "Status changed to Can't move", 11],
      ['responder', 'Understood. A crew is coming to carry her down the west stair.', 9],
      ['resident', 'Smoke is getting thicker by the door.', 4],
      ['resident', 'Please hurry', 2],
    ],
  },
  {
    unread: 1,
    lines: [
      ['resident', scenario.residents[1].text, 13],
      ['responder', 'Stay in the metal shop. Do not open the hallway door.', 12],
      ['resident', '', 11, { quick: 'trapped' }],
      ['system', 'Status changed to Trapped', 11],
      ['resident', 'There are three of us. One is coughing a lot.', 9],
      ['responder', 'Alpha is coming down the east stair to you now.', 6],
      ['resident', 'We can hear something in the stairwell.', 2],
    ],
  },
  {
    unread: 0,
    lines: [
      ['resident', scenario.residents[2].text, 12],
      ['responder', 'The west stair is clear right now. Follow the route on your screen.', 11],
      ['resident', 'Is the elevator safe to use?', 10],
      ['responder', 'Do not use the elevator. Take the west stair all the way down.', 10],
      ['system', 'Route ready · Exit via Main Entrance', 9],
      ['resident', 'Okay, putting shoes on.', 3],
      ['responder', 'Cover your mouth with a cloth. We will meet you at the main entrance.', 2],
    ],
  },
  {
    unread: 1,
    lines: [
      ['resident', scenario.residents[3].text, 12],
      ['responder', 'Which door are you near?', 11],
      ['resident', 'The one by the resin printers. The hallway is full of smoke.', 10],
      ['responder', 'Stay put and seal the door gap. A crew is assigned.', 9],
      ['resident', '', 7, { quick: 'trapped' }],
      ['system', 'Status changed to Trapped', 7],
      ['resident', 'We are by the window on the north side.', 3],
    ],
  },
  {
    unread: 0,
    lines: [
      ['resident', scenario.residents[4].text, 10],
      ['responder', 'Your route is clear. Leave through the main entrance now.', 9],
      ['resident', 'Going now.', 8],
      ['responder', 'Do not stop for belongings.', 8],
      ['resident', 'I am in the lobby.', 4],
      ['responder', 'Good. Keep going to the staging area on Ridge Road.', 3],
    ],
  },
  {
    unread: 0,
    lines: [
      ['resident', scenario.residents[5].text, 11],
      ['responder', 'You are on the first floor. Can you reach the east entrance?', 10],
      ['resident', 'The ramp by the east entrance is open.', 9],
      ['responder', 'Head for the east entrance. Firefighters are outside.', 8],
      ['resident', 'Moving now, slowly.', 5],
      ['responder', 'Take your time. The east corridor is clear.', 4],
    ],
  },
]

function buildThread(id: string, personId: string | undefined, place: string | undefined, lines: Line[], now: number, unread: number): Thread {
  return {
    id,
    kind: personId ? 'resident' : 'crew',
    personId,
    unread,
    messages: lines.map(([from, text, ago, options = {}], i) => ({
      id: `${id}-${i}`,
      threadId: id,
      from,
      sender: options.sender ?? (from === 'system' ? SYSTEM_SENDER : from === 'responder' ? RESPONDER_SENDER : place ?? 'Resident'),
      text: options.quick ? QUICK_REPLY_LABEL[options.quick] : text,
      quick: options.quick,
      at: now - ago * MIN,
    })),
  }
}

/** Seeded conversations. Civilian ids follow scenario order on a freshly seeded engine (CIV_001…). */
export function seedThreads(now: number): Thread[] {
  const residents = RESIDENTS.map(({ lines, unread }, i) => {
    const civilianId = `CIV_00${i + 1}`
    return buildThread(threadIdFor(civilianId), civilianId, RESIDENT_PLACES[i], lines, now, unread)
  })
  return [buildThread(CREW_THREAD_ID, undefined, undefined, CREW, now, 0), ...residents]
}
```

- [ ] **Step 6: Implement the layout**

`src/data/jacobsLayout.ts`:
```ts
/**
 * Presentation geometry for Jacobs Hall in engine coordinates (JACOBS_LOCAL meters, x east, y north).
 * The engine graph only has points; these footprints give them shape for the 3D view.
 * Illustrative, like the engine's own coordinates. Each footprint must contain its node.
 */
import type { FloorId } from '../engine/types'

export const SHELL = { x0: 0, y0: 0, x1: 40, y1: 20 } as const

export type FootprintKind = 'room' | 'corridor' | 'stairs' | 'elevator' | 'lobby' | 'staging'
export type Footprint = { id: string; nodeId: string | null; floor: FloorId; kind: FootprintKind; x0: number; y0: number; x1: number; y1: number; label: string }

const ROOMS: Record<FloorId, [west: { id: string; label: string }, east: { id: string; label: string }]> = {
  B: [{ id: 'B_STUDIO_10', label: 'Studio 10' }, { id: 'B_METAL_SHOP', label: 'Metal Shop' }],
  F1: [{ id: 'F1_STUDIO_110', label: 'Studio 110' }, { id: 'F1_STUDIO_120', label: 'Studio 120' }],
  F2: [{ id: 'F2_STUDIO_210', label: 'Studio 210' }, { id: 'F2_STUDIO_220', label: 'Studio 220' }],
  F3: [{ id: 'F3_STUDIO_310', label: 'Studio 310' }, { id: 'F3_PROTOTYPING_LAB', label: 'Advanced Prototyping Lab' }],
}

function floorFootprints(floor: FloorId): Footprint[] {
  const [west, east] = ROOMS[floor]
  const fp = (id: string, kind: FootprintKind, x0: number, y0: number, x1: number, y1: number, label: string): Footprint => ({
    id, nodeId: id, floor, kind, x0, y0, x1, y1, label,
  })
  return [
    fp(`${floor}_STAIR_A`, 'stairs', 2, 7, 8, 13, 'West stair'),
    fp(`${floor}_STAIR_B`, 'stairs', 32, 7, 38, 13, 'East stair'),
    fp(`${floor}_CORRIDOR_WEST`, 'corridor', 8, 8, 16, 12, 'West corridor'),
    fp(`${floor}_CORRIDOR_CENTER`, 'corridor', 16, 8, 24, 12, 'Center corridor'),
    fp(`${floor}_CORRIDOR_EAST`, 'corridor', 24, 8, 32, 12, 'East corridor'),
    fp(`${floor}_ELEVATOR`, 'elevator', 19, 12, 21, 14, 'Elevator'),
    fp(west.id, 'room', 2, 14, 19, 20, west.label),
    fp(east.id, 'room', 21, 14, 38, 20, east.label),
  ]
}

export const FOOTPRINTS: Footprint[] = [
  ...(['B', 'F1', 'F2', 'F3'] as const).flatMap(floorFootprints),
  { id: 'F1_LOBBY', nodeId: null, floor: 'F1', kind: 'lobby', x0: 8, y0: 0.5, x1: 38, y1: 7, label: 'Lobby' },
  { id: 'EXT_STAGING', nodeId: 'EXT_STAGING', floor: 'F1', kind: 'staging', x0: 14, y0: -13, x1: 26, y1: -7, label: 'Staging' },
]

export const ENTRANCES = [
  { nodeId: 'F1_ENTRANCE_MAIN', x: 20, y: 0, label: 'Main entrance' },
  { nodeId: 'F1_ENTRANCE_EAST', x: 35, y: 0, label: 'East entrance' },
] as const

/** Demo furnishing kinds (demo/src/furnishings.js), placed in engine meters. w along x, d along y. */
export type FurnishingSpec = { id: string; nodeId: string; kind: string; x: number; y: number; w: number; d: number; h: number }

const f = (id: string, nodeId: string, kind: string, x: number, y: number, w: number, d: number, h: number): FurnishingSpec => ({ id, nodeId, kind, x, y, w, d, h })

export const FURNISHINGS: FurnishingSpec[] = [
  f('b10-bench-1', 'B_STUDIO_10', 'workbench', 6, 17.5, 2.2, 2, 1),
  f('b10-bench-2', 'B_STUDIO_10', 'workbench', 16, 17.5, 2.2, 2, 1),
  f('b10-screen', 'B_STUDIO_10', 'display', 10.5, 19.4, 3.6, 0.5, 1.7),
  f('metal-waterjet', 'B_METAL_SHOP', 'waterjet', 26, 18.4, 3.6, 2.5, 1.25),
  f('metal-saw', 'B_METAL_SHOP', 'bandsaw', 33, 18.6, 1.2, 1.4, 1.7),
  f('metal-weld', 'B_METAL_SHOP', 'welding', 35.5, 15.5, 1.5, 1.5, 1.25),
  f('110-laser', 'F1_STUDIO_110', 'laser', 6, 18.5, 3.3, 1.8, 1.3),
  f('110-printers', 'F1_STUDIO_110', 'printerBank', 15.5, 18.5, 3.1, 1.8, 1.7),
  f('110-robot', 'F1_STUDIO_110', 'robotArm', 5, 15.2, 1.7, 1.8, 1.8),
  f('120-cnc', 'F1_STUDIO_120', 'cnc', 25.5, 18.4, 4.2, 2.5, 1.3),
  f('120-tablesaw', 'F1_STUDIO_120', 'tableSaw', 33, 18.5, 2.1, 1.8, 1.05),
  f('120-bandsaw', 'F1_STUDIO_120', 'bandsaw', 36, 15.5, 1.2, 1.3, 1.7),
  f('210-desk-1', 'F2_STUDIO_210', 'desk', 4.5, 18.5, 1.6, 2, 1.2),
  f('210-desk-2', 'F2_STUDIO_210', 'desk', 7.5, 18.5, 1.6, 2, 1.2),
  f('210-desk-3', 'F2_STUDIO_210', 'desk', 16, 18.5, 1.6, 2, 1.2),
  f('210-lounge', 'F2_STUDIO_210', 'lounge', 16.5, 15.2, 2.5, 1.2, 1),
  f('220-table-1', 'F2_STUDIO_220', 'teachingTable', 25, 18.3, 3, 2, 1),
  f('220-table-2', 'F2_STUDIO_220', 'teachingTable', 32, 15.5, 3, 2, 1),
  f('220-board', 'F2_STUDIO_220', 'whiteboard', 34, 19.4, 3, 0.6, 1.5),
  f('310-wall', 'F3_STUDIO_310', 'display', 10.5, 19.5, 6.5, 0.5, 1.7),
  f('310-table-1', 'F3_STUDIO_310', 'teachingTable', 5.5, 16, 2.6, 1.6, 1),
  f('310-table-2', 'F3_STUDIO_310', 'teachingTable', 16.5, 16, 2.6, 1.6, 1),
  f('lab-resin-1', 'F3_PROTOTYPING_LAB', 'resinPrinter', 24, 18.6, 1.5, 1.7, 1.7),
  f('lab-fortus', 'F3_PROTOTYPING_LAB', 'enclosedPrinter', 27, 18.6, 1.7, 1.9, 1.9),
  f('lab-resin-2', 'F3_PROTOTYPING_LAB', 'resinPrinter', 35.5, 18.6, 1.5, 1.7, 1.7),
]

const BY_NODE = new Map(FOOTPRINTS.filter((fp) => fp.nodeId).map((fp) => [fp.nodeId as string, fp]))

export function footprintFor(nodeId: string): Footprint | undefined {
  return BY_NODE.get(nodeId)
}

export function contains(fp: Footprint, x: number, y: number): boolean {
  return x >= fp.x0 && x <= fp.x1 && y >= fp.y0 && y <= fp.y1
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test -- src/data && npm run typecheck`
Expected: scenario and layout tests PASS (14); `tsc` clean. Old Phase 1 tests still pass too.

- [ ] **Step 8: Commit**

```bash
git add src/data/scenario.json src/data/scenarioThreads.ts src/data/jacobsLayout.ts src/data/engine-snapshot.json src/data/scenario.test.ts src/data/jacobsLayout.test.ts src/engine/fixture.ts scripts/capture_engine_snapshot.py
git commit -m "feat: add Jacobs scenario, recorded engine snapshot and 3D layout"
```
(append the Co-Authored-By trailer)

---

### Task J4: Derived civilian state and instructions

**Files:**
- Create: `src/engine/derive.ts`
- Test: `src/engine/derive.test.ts`

**Interfaces:**
- Consumes: engine types (J2); `ENGINE_FIXTURE` (J3, tests only); `Instruction`, `InstructionMode`, `Priority` from `src/types.ts`.
- Produces:
  - `type CivilianStatus = 'trapped' | 'immobile' | 'sheltering' | 'evacuated' | 'unknown'`, `CIVILIAN_STATUS_LABEL`
  - `type NodeIndex = ReadonlyMap<string, GraphNode>`, `indexNodes(graph)`
  - `civiliansOf(snapshot)`, `respondersOf(snapshot)`
  - `civilianStatus(c, nodes)`, `civilianTone(c, nodes): Priority`, `peopleCount(c)`, `placeLabel(c, nodes)`, `floorOf(c, nodes): FloorId | null`
  - `fireFloors(hazards, nodes)`, `firstStair(route, nodes)`, `exitLabel(route, nodes)`
  - `instructionMode(c, evac, nodes)`, `instructionsFor(c, evac, hazards, nodes): Instruction[]`
  - `describeEvacuationChange(prev, next, nodes): string | null`, `statusChangeText(prev, next): string | null`
  - `rescueRoutesFor(routes, civilianId)`, `assignedResponder(routes, civilianId)`, `nodePosition(node): WorldPosition`

- [ ] **Step 1: Write the failing test**

`src/engine/derive.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { ENGINE_FIXTURE } from './fixture'
import {
  assignedResponder,
  civilianStatus,
  civilianTone,
  civiliansOf,
  describeEvacuationChange,
  fireFloors,
  indexNodes,
  instructionMode,
  instructionsFor,
  placeLabel,
  statusChangeText,
} from './derive'
import type { CivilianReport, Entity, Hazard, ReviewPriority, Route } from './types'

const nodes = indexNodes(ENGINE_FIXTURE.graph)

const report = (overrides: Partial<CivilianReport> = {}): CivilianReport => ({
  raw_text: 'test', location: null, people_count: 1, mobility_limited: false, unconscious: false,
  smoke_reported: false, fire_reported: false, exits_blocked: false, unknowns: [], ...overrides,
})

const civilian = (node: string | null, rep: Partial<CivilianReport> = {}, priority: ReviewPriority = 'standard_review'): Entity => ({
  entity_id: 'CIV_X', entity_type: 'civilian', name: null, world_position: null, graph_node_id: node,
  source: 'civilian_report', position_status: 'reported', last_updated: 't', report: report(rep),
  priority: { priority, score: 0, reported_conditions: [], reason: '', requires_responder_review: true, flags: [] }, flags: [],
})

const route = (path: string[], status: Route['status'] = 'candidate'): Route => ({
  route_id: 'EVAC_CIV_X', status, start_node: path[0], destination_node: path[path.length - 1], nodes: path, edge_ids: [],
  polyline: [], steps: [], total_distance_m: 0, total_cost: 0, hazards_considered: [], assumptions: [],
  requires_command_approval: true, unreachable_reason: null,
})

const hazard = (hazard_type: Hazard['hazard_type'], node_id: string): Hazard => ({
  hazard_id: `H_${node_id}`, hazard_type, node_id, edge_id: null, verified: true, source: 'test', description: '', created_at: 't',
})

const FROM_310 = ['F3_STUDIO_310', 'F3_CORRIDOR_WEST', 'F3_STAIR_A', 'F2_STAIR_A', 'F1_STAIR_A', 'F1_CORRIDOR_WEST', 'F1_CORRIDOR_CENTER', 'F1_ENTRANCE_MAIN']
const SCENARIO_HAZARDS = [hazard('fire', 'F2_CORRIDOR_EAST'), hazard('smoke', 'F3_CORRIDOR_CENTER')]

describe('civilian status and tone', () => {
  it('derives status from location and report', () => {
    expect(civilianStatus(civilian('EXT_STAGING', { exits_blocked: true }), nodes)).toBe('evacuated')
    expect(civilianStatus(civilian('F1_ENTRANCE_EAST'), nodes)).toBe('evacuated')
    expect(civilianStatus(civilian('F2_STUDIO_210', { mobility_limited: true, exits_blocked: true }), nodes)).toBe('immobile')
    expect(civilianStatus(civilian('B_METAL_SHOP', { exits_blocked: true }), nodes)).toBe('trapped')
    expect(civilianStatus(civilian('F3_STUDIO_310'), nodes)).toBe('sheltering')
    expect(civilianStatus(civilian(null), nodes)).toBe('unknown')
  })

  it('maps priority to tone, with evacuated always safe', () => {
    expect(civilianTone(civilian('F2_STUDIO_210', {}, 'urgent_review'), nodes)).toBe('critical')
    expect(civilianTone(civilian('F2_STUDIO_210', {}, 'priority_review'), nodes)).toBe('moderate')
    expect(civilianTone(civilian('F2_STUDIO_210', {}, 'standard_review'), nodes)).toBe('moderate')
    expect(civilianTone(civilian('EXT_STAGING', {}, 'urgent_review'), nodes)).toBe('safe')
  })

  it('labels the place from the graph', () => {
    expect(placeLabel(civilian('F3_PROTOTYPING_LAB'), nodes)).toBe('Advanced Prototyping Lab')
    expect(placeLabel(civilian(null), nodes)).toBe('Location unknown')
  })
})

describe('instructionsFor', () => {
  it('gives go instructions down the west stair from Studio 310', () => {
    const c = civilian('F3_STUDIO_310')
    expect(instructionsFor(c, route(FROM_310), SCENARIO_HAZARDS, nodes).map((i) => i.text)).toEqual([
      'Fire reported on Floor 2.',
      'Your route is clear.',
      'Take the WEST STAIR down.',
      'Do not use the elevator.',
    ])
  })

  it('warns about smoke on the route', () => {
    const lines = instructionsFor(civilian('F3_STUDIO_310'), route(FROM_310), [hazard('smoke', 'F3_CORRIDOR_WEST')], nodes)
    expect(lines[1].text).toBe('Smoke on your route. Stay low.')
    expect(lines[0].text).toBe('No fire reported near you.')
  })

  it('sends basement occupants up the east stair', () => {
    const path = ['B_METAL_SHOP', 'B_CORRIDOR_EAST', 'B_STAIR_B', 'F1_STAIR_B', 'F1_CORRIDOR_EAST', 'F1_ENTRANCE_EAST']
    expect(instructionsFor(civilian('B_METAL_SHOP'), route(path), [], nodes)[2].text).toBe('Take the EAST STAIR up.')
  })

  it('sends floor 1 occupants straight to the exit', () => {
    const path = ['F1_STUDIO_120', 'F1_CORRIDOR_EAST', 'F1_ENTRANCE_EAST']
    expect(instructionsFor(civilian('F1_STUDIO_120'), route(path), [], nodes)[2].text).toBe('Go to the EAST ENTRANCE.')
  })

  it('switches to shelter-in-place when no route exists', () => {
    const c = civilian('F3_STUDIO_310')
    const lines = instructionsFor(c, route(FROM_310, 'unreachable'), [], nodes)
    expect(instructionMode(c, route(FROM_310, 'unreachable'), nodes)).toBe('stay')
    expect(lines.map((l) => l.text)).toEqual([
      'Your exits are blocked.',
      'Close your door. Seal gaps with towels.',
      'Go to a window and signal.',
      'Responders know you are in Studio 310.',
    ])
    expect(instructionsFor(c, null, [], nodes)[0].text).toBe('Your exits are blocked.')
  })

  it('never tells an evacuated civilian to shelter', () => {
    const c = civilian('EXT_STAGING')
    expect(instructionMode(c, route(FROM_310, 'unreachable'), nodes)).toBe('out')
    expect(instructionsFor(c, null, [], nodes)[0].text).toBe('You are out of the building.')
  })

  it('lists every floor with fire', () => {
    expect(fireFloors([hazard('fire', 'F3_CORRIDOR_EAST'), hazard('fire', 'F2_CORRIDOR_EAST'), hazard('smoke', 'B_CORRIDOR_EAST')], nodes)).toEqual(['F2', 'F3'])
    const lines = instructionsFor(civilian('F3_STUDIO_310'), route(FROM_310), [hazard('fire', 'F3_CORRIDOR_EAST'), hazard('fire', 'F2_CORRIDOR_EAST')], nodes)
    expect(lines[0].text).toBe('Fire reported on Floor 2 and Floor 3.')
  })

  it('keeps every recorded civilian within four lines', () => {
    for (const c of civiliansOf(ENGINE_FIXTURE.state)) {
      const lines = instructionsFor(c, ENGINE_FIXTURE.evacuations[c.entity_id], ENGINE_FIXTURE.state.hazards, nodes)
      expect(lines.length).toBeLessThanOrEqual(4)
    }
  })
})

describe('change descriptions', () => {
  const open = route(FROM_310)
  const east = route(['F3_STUDIO_310', 'F3_CORRIDOR_EAST', 'F3_STAIR_B', 'F2_STAIR_B', 'F1_STAIR_B', 'F1_CORRIDOR_EAST', 'F1_ENTRANCE_EAST'])

  it('describes route changes once there is a previous observation', () => {
    expect(describeEvacuationChange(undefined, open, nodes)).toBeNull()
    expect(describeEvacuationChange(open, route(FROM_310, 'unreachable'), nodes)).toBe('Route blocked · Shelter in place')
    expect(describeEvacuationChange(null, open, nodes)).toBe('Route open · Exit via Main Entrance')
    expect(describeEvacuationChange(open, east, nodes)).toBe('Route updated · Main Entrance → East Entrance')
    expect(describeEvacuationChange(open, open, nodes)).toBeNull()
  })

  it('describes status changes only when the status changes', () => {
    expect(statusChangeText(undefined, 'trapped')).toBeNull()
    expect(statusChangeText('trapped', 'trapped')).toBeNull()
    expect(statusChangeText('sheltering', 'trapped')).toBe('Status changed to Trapped')
  })

  it('finds the responder assigned to a civilian', () => {
    const rescue = ENGINE_FIXTURE.state.routes.find((r) => r.route_id === 'RESCUE_UNIT_ALPHA')
    expect(rescue?.meta?.civilian_id).toBeDefined()
    expect(assignedResponder(ENGINE_FIXTURE.state.routes, rescue?.meta?.civilian_id ?? '')).toBe('UNIT_ALPHA')
    expect(assignedResponder(ENGINE_FIXTURE.state.routes, 'CIV_NONE')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/engine/derive.test.ts`
Expected: FAIL — `./derive` not found.

- [ ] **Step 3: Implement**

`src/engine/derive.ts`:
```ts
/** Pure derivations from engine payloads to what the UI shows. */
import type { Instruction, InstructionMode, Priority } from '../types'
import {
  FLOOR_ELEVATION,
  FLOOR_NAME,
  type BuildingGraph,
  type Entity,
  type FloorId,
  type GraphNode,
  type Hazard,
  type IncidentSnapshot,
  type Route,
  type WorldPosition,
} from './types'

export type CivilianStatus = 'trapped' | 'immobile' | 'sheltering' | 'evacuated' | 'unknown'
export type NodeIndex = ReadonlyMap<string, GraphNode>

export const CIVILIAN_STATUS_LABEL: Record<CivilianStatus, string> = {
  trapped: 'Trapped',
  immobile: "Can't move",
  sheltering: 'Sheltering',
  evacuated: 'Evacuated',
  unknown: 'No location',
}

const FLOOR_ORDER: FloorId[] = ['B', 'F1', 'F2', 'F3']
const BUILDING_CENTER_X = 20

export function indexNodes(graph: BuildingGraph | null): NodeIndex {
  return new Map((graph?.nodes ?? []).map((n) => [n.node_id, n]))
}

export function civiliansOf(snapshot: IncidentSnapshot | null): Entity[] {
  return (snapshot?.entities ?? []).filter((e) => e.entity_type === 'civilian')
}

export function respondersOf(snapshot: IncidentSnapshot | null): Entity[] {
  return (snapshot?.entities ?? []).filter((e) => e.entity_type === 'responder')
}

function nodeOf(c: Entity, nodes: NodeIndex): GraphNode | undefined {
  return c.graph_node_id ? nodes.get(c.graph_node_id) : undefined
}

export function civilianStatus(c: Entity, nodes: NodeIndex): CivilianStatus {
  const node = nodeOf(c, nodes)
  if (!node) return 'unknown'
  if (node.node_type === 'staging' || node.node_type === 'entrance') return 'evacuated'
  if (c.report?.mobility_limited || c.report?.unconscious) return 'immobile'
  if (c.report?.exits_blocked) return 'trapped'
  return 'sheltering'
}

export function civilianTone(c: Entity, nodes: NodeIndex): Priority {
  if (civilianStatus(c, nodes) === 'evacuated') return 'safe'
  return c.priority?.priority === 'urgent_review' ? 'critical' : 'moderate'
}

export function peopleCount(c: Entity): number {
  return c.report?.people_count ?? 1
}

export function placeLabel(c: Entity, nodes: NodeIndex): string {
  return nodeOf(c, nodes)?.label ?? 'Location unknown'
}

export function floorOf(c: Entity, nodes: NodeIndex): FloorId | null {
  return nodeOf(c, nodes)?.floor_id ?? null
}

export function fireFloors(hazards: Hazard[], nodes: NodeIndex): FloorId[] {
  const burning = new Set(
    hazards.filter((h) => h.hazard_type === 'fire' && h.node_id).map((h) => nodes.get(h.node_id as string)?.floor_id),
  )
  return FLOOR_ORDER.filter((f) => burning.has(f))
}

function joinFloors(floors: FloorId[]): string {
  const names = floors.map((f) => FLOOR_NAME[f])
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

export function firstStair(route: Route, nodes: NodeIndex): { side: 'WEST' | 'EAST'; direction: 'up' | 'down' } | null {
  const index = route.nodes.findIndex((id) => nodes.get(id)?.node_type === 'stairs')
  if (index < 0) return null
  const stair = nodes.get(route.nodes[index]) as GraphNode
  const nextFloor = route.nodes
    .slice(index + 1)
    .map((id) => nodes.get(id))
    .find((n) => n && n.floor_id !== stair.floor_id)
  const direction = nextFloor && FLOOR_ELEVATION[nextFloor.floor_id] > FLOOR_ELEVATION[stair.floor_id] ? 'up' : 'down'
  return { side: stair.x < BUILDING_CENTER_X ? 'WEST' : 'EAST', direction }
}

export function exitLabel(route: Route, nodes: NodeIndex): string {
  return nodes.get(route.destination_node)?.label ?? 'the exit'
}

export function instructionMode(c: Entity, evac: Route | null | undefined, nodes: NodeIndex): InstructionMode {
  if (civilianStatus(c, nodes) === 'evacuated') return 'out'
  return evac?.status === 'candidate' ? 'go' : 'stay'
}

export function instructionsFor(c: Entity, evac: Route | null | undefined, hazards: Hazard[], nodes: NodeIndex): Instruction[] {
  const mode = instructionMode(c, evac, nodes)
  if (mode === 'out') {
    return [
      { text: 'You are out of the building.', tone: 'go' },
      { text: 'Stay at the staging area.', tone: 'info' },
      { text: 'Tell a responder if anyone is missing.', tone: 'info' },
    ]
  }
  if (mode === 'stay' || !evac) {
    return [
      { text: 'Your exits are blocked.', tone: 'stay' },
      { text: 'Close your door. Seal gaps with towels.', tone: 'stay' },
      { text: 'Go to a window and signal.', tone: 'stay' },
      { text: `Responders know you are in ${placeLabel(c, nodes)}.`, tone: 'info' },
    ]
  }
  const fires = fireFloors(hazards, nodes)
  const smokeOnRoute = hazards.some((h) => h.hazard_type === 'smoke' && h.node_id !== null && evac.nodes.includes(h.node_id))
  const stair = firstStair(evac, nodes)
  return [
    { text: fires.length ? `Fire reported on ${joinFloors(fires)}.` : 'No fire reported near you.', tone: 'info' },
    { text: smokeOnRoute ? 'Smoke on your route. Stay low.' : 'Your route is clear.', tone: smokeOnRoute ? 'info' : 'go' },
    { text: stair ? `Take the ${stair.side} STAIR ${stair.direction}.` : `Go to the ${exitLabel(evac, nodes).toUpperCase()}.`, tone: 'go' },
    { text: 'Do not use the elevator.', tone: 'info' },
  ]
}

/** `prev === undefined` means this civilian has not been observed yet: never announce a change. */
export function describeEvacuationChange(prev: Route | null | undefined, next: Route | null | undefined, nodes: NodeIndex): string | null {
  if (prev === undefined) return null
  const wasOpen = prev?.status === 'candidate'
  const isOpen = next?.status === 'candidate'
  if (wasOpen && !isOpen) return 'Route blocked · Shelter in place'
  if (!wasOpen && isOpen && next) return `Route open · Exit via ${exitLabel(next, nodes)}`
  if (wasOpen && isOpen && prev && next && prev.destination_node !== next.destination_node) {
    return `Route updated · ${exitLabel(prev, nodes)} → ${exitLabel(next, nodes)}`
  }
  return null
}

export function statusChangeText(prev: CivilianStatus | undefined, next: CivilianStatus): string | null {
  if (prev === undefined || prev === next) return null
  return `Status changed to ${CIVILIAN_STATUS_LABEL[next]}`
}

export function rescueRoutesFor(routes: Route[], civilianId: string): Route[] {
  return routes.filter((r) => r.meta?.civilian_id === civilianId && r.status === 'candidate')
}

export function assignedResponder(routes: Route[], civilianId: string): string | null {
  return routes.find((r) => r.meta?.civilian_id === civilianId && r.meta.responder_id)?.meta?.responder_id ?? null
}

export function nodePosition(node: GraphNode): WorldPosition {
  return { x: node.x, y: node.y, z: node.z, floor_id: node.floor_id, coordinate_frame: 'JACOBS_LOCAL' }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/engine && npm run typecheck`
Expected: PASS; `tsc` clean.

- [ ] **Step 5: Commit**

```bash
git add src/engine/derive.ts src/engine/derive.test.ts
git commit -m "feat: derive civilian status, tone and evacuation instructions from engine data"
```
(append the Co-Authored-By trailer)

---
### Task J5: Store rewrite on the engine, sync hook, Phase 1 cleanup

**Files:**
- Rewrite: `src/types.ts`, `src/lib/labels.ts`, `src/lib/format.ts`, `src/lib/format.test.ts`, `src/store/types.ts`, `src/store/events.ts`, `src/store/commsSlice.ts`, `src/store/uiSlice.ts`, `src/store/index.ts`, `src/store/selectors.ts`, `src/store/store.test.ts`
- Create: `src/store/engineSlice.ts`, `src/engine/fakeEngine.ts`, `src/engine/useEngineSync.ts`
- Delete: `src/lib/geometry.ts`, `src/lib/geometry.test.ts`, `src/lib/grid.ts`, `src/lib/grid.test.ts`, `src/lib/routing.ts`, `src/lib/routing.test.ts`, `src/lib/guidance.ts`, `src/lib/guidance.test.ts`, `src/lib/priority.ts`, `src/lib/priority.test.ts`, `src/lib/movement.ts`, `src/lib/movement.test.ts`, `src/lib/perception.ts`, `src/lib/camera.ts`, `src/lib/sensors.test.ts`, `src/data/mock.ts`, `src/data/mock.test.ts`, `src/store/worldSlice.ts`, `src/store/quickReply.ts`, `src/store/quickReply.test.ts`
- Keep: `tests/setup.ts` (jsdom localStorage shim for Node 26)

**Interfaces:**
- Consumes: engine client/events/instance/fixture/derive (J2–J4); scenario and threads (J3).
- Produces (later tasks rely on these exact names):
  - `src/types.ts`: `Priority`, `Instruction`, `InstructionMode`, `QuickReply`, `MessageFrom`, `Message`, `Thread`, `Perspective`, `GoStay`, `ResidentView`, `OverlayKind = 'fire' | 'smoke' | 'risk'`, `SimTool = 'fire' | 'smoke' | 'blocked' | 'remove' | 'move'`, `FloorFilter = 'all' | FloorId`
  - `useSentinel` state:
    - engine: `graph`, `snapshot`, `prediction`, `recommendations`, `evacuations`, `advisories`, `lastSeq`, `updatedAt`, `engineStatus: 'connecting' | 'live' | 'offline'`, `engineError`, `pending`; actions `connect()`, `poll()`, `refresh()`, `seed()`, `resetIncident()`, `reportCivilian(id, text)`, `moveCivilian(id, nodeId)`, `addHazard(type, nodeId)`, `removeHazard(id)`, `assignResponder(responderId, civilianId)`, `simulateDetection(camera)` (all actions return `Promise<boolean>`)
    - comms: `threads`, `sendMessage(threadId, from, text)`, `sendQuickReply(civilianId, reply)`, `clearThread(id)`, `markRead(id)`
    - ui: `perspective`, `viewingAsId`, `selectedCivilianId`, `hoveredCivilianId`, `selectedThreadId`, `overlays`, `floor`, `simMode`, `simTool`, `moveSourceId`, `residentView`, `devGoStay`, `expandedCameraId`, `composerFocusNonce`; setters `setPerspective`, `setViewingAs`, `selectCivilian`, `hoverCivilian`, `selectThread`, `toggleOverlay`, `setFloor`, `setSimMode`, `setSimTool`, `setMoveSource`, `setResidentView`, `setDevGoStay`, `setExpandedCamera`, `requestComposerFocus`
    - `resetDemo(): Promise<void>`
  - `STORE_KEY = 'sentinel-jacobs'`, `STORE_VERSION = 2`, `isValidPersisted`, `mergePersisted`, `POLL_MS = 1500`, `RETRY_MS = 5000`, `FULL_REFRESH_MS = 15000`, `STAGING_NODE = 'EXT_STAGING'`, `fixtureData(now)`, `emptyEngineData()`, `initialUi(perspective?, viewingAsId?)`
  - selectors: `nodesFor(graph)`, `useNodes()`, `useCivilians()`, `useResponders()`, `useEntity(id)`, `useThread(id)`, `effectiveEvacuation(route, override)`, `lastResidentMessage(thread)`
  - `useEngineSync()` hook; `FakeEngine` test client

- [ ] **Step 1: Rewrite the local types, labels and format**

`src/types.ts`:
```ts
import type { FloorId } from './engine/types'

/** Marker tone: critical (error), moderate (warning), safe (success). */
export type Priority = 'critical' | 'moderate' | 'safe'
export type Instruction = { text: string; tone: 'go' | 'stay' | 'info' }
export type InstructionMode = 'go' | 'stay' | 'out'

export type QuickReply = 'out' | 'trapped' | 'cant-move'
export type MessageFrom = 'resident' | 'responder' | 'system'
export type Message = {
  id: string
  threadId: string
  from: MessageFrom
  sender: string
  text: string
  quick?: QuickReply
  at: number
}
export type Thread = { id: string; kind: 'crew' | 'resident'; personId?: string; messages: Message[]; unread: number }

export type Perspective = 'firefighter' | 'resident'
export type GoStay = 'auto' | 'go' | 'stay'
export type ResidentView = 'building' | 'ar'
export type OverlayKind = 'fire' | 'smoke' | 'risk'
export type SimTool = 'fire' | 'smoke' | 'blocked' | 'remove' | 'move'
export type FloorFilter = 'all' | FloorId
```

`src/lib/labels.ts`:
```ts
import type { ReviewPriority } from '../engine/types'
import type { Priority, QuickReply } from '../types'

export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: 'Critical',
  moderate: 'Moderate',
  safe: 'Safe',
}

export const REVIEW_PRIORITY_LABEL: Record<ReviewPriority, string> = {
  urgent_review: 'Urgent',
  priority_review: 'Priority',
  standard_review: 'Standard',
}

export const QUICK_REPLY_LABEL: Record<QuickReply, string> = {
  out: "I'm out",
  trapped: "I'm trapped",
  'cant-move': "Can't move",
}

/** Chip color for each quick reply: success, error, warning. */
export const QUICK_REPLY_TONE: Record<QuickReply, Priority> = {
  out: 'safe',
  trapped: 'critical',
  'cant-move': 'moderate',
}

/** Phrases appended to a civilian's report so the engine's triage rules pick them up. */
export const QUICK_REPLY_REPORT_TEXT: Record<Exclude<QuickReply, 'out'>, string> = {
  trapped: "I'm trapped.",
  'cant-move': "I can't move.",
}

export const RESPONDER_LABEL: Record<string, string> = { UNIT_ALPHA: 'Alpha', UNIT_BRAVO: 'Bravo' }
export const RESPONDER_SENDER = 'E7 · Reyes'
export const SYSTEM_SENDER = 'Sentinel'
export const MAX_MESSAGE_LENGTH = 500
```

In `src/lib/format.ts`, replace the `Point` import and `formatCoords` with:
```ts
import type { WorldPosition } from '../engine/types'
```
```ts
export function formatCoords(p: WorldPosition): string {
  return `${p.floor_id} · ${p.x.toFixed(1)}, ${p.y.toFixed(1)} m`
}
```
In `src/lib/format.test.ts`, replace the `formatCoords` assertion with:
```ts
    expect(formatCoords({ x: 12, y: 16.44, z: 4, floor_id: 'F2', coordinate_frame: 'JACOBS_LOCAL' })).toBe('F2 · 12.0, 16.4 m')
```

- [ ] **Step 2: Delete the Phase 1 simulation modules**

```bash
git rm src/lib/geometry.ts src/lib/geometry.test.ts src/lib/grid.ts src/lib/grid.test.ts \
  src/lib/routing.ts src/lib/routing.test.ts src/lib/guidance.ts src/lib/guidance.test.ts \
  src/lib/priority.ts src/lib/priority.test.ts src/lib/movement.ts src/lib/movement.test.ts \
  src/lib/perception.ts src/lib/camera.ts src/lib/sensors.test.ts \
  src/data/mock.ts src/data/mock.test.ts \
  src/store/worldSlice.ts src/store/quickReply.ts src/store/quickReply.test.ts
```

- [ ] **Step 3: Write the fake engine and the failing store tests**

`src/engine/fakeEngine.ts`:
```ts
/** In-memory EngineClient for tests, serving the recorded snapshot and logging calls. */
import { EngineError, rescueRouteId, type EngineClient } from './client'
import { ENGINE_FIXTURE } from './fixture'
import type { Entity, EngineEvent, HazardType, IncidentSnapshot, Route } from './types'

type Call = { method: keyof EngineClient; args: unknown[] }

export class FakeEngine implements EngineClient {
  calls: Call[] = []
  /** When true every call throws an "unreachable" EngineError. */
  down = false
  /** When false the engine has no civilians until a report arrives. */
  seeded: boolean
  evacuationOverrides: Record<string, Route | null> = {}
  private queue: EngineEvent[] = []
  private seq = 0

  constructor({ seeded = true }: { seeded?: boolean } = {}) {
    this.seeded = seeded
  }

  callsTo(method: keyof EngineClient): Call[] {
    return this.calls.filter((c) => c.method === method)
  }

  emit(eventType: string): void {
    this.seq += 1
    this.queue = [...this.queue, { seq: this.seq, timestamp: 't', event_type: eventType, payload: {} }]
  }

  private hit(method: keyof EngineClient, args: unknown[]): void {
    this.calls = [...this.calls, { method, args }]
    if (this.down) throw new EngineError(`${method} unreachable`, null)
  }

  private civilian(id?: string): Entity {
    const civilians = ENGINE_FIXTURE.state.entities.filter((e) => e.entity_type === 'civilian')
    return civilians.find((c) => c.entity_id === id) ?? civilians[0]
  }

  async graph() {
    this.hit('graph', [])
    return ENGINE_FIXTURE.graph
  }

  async state(): Promise<IncidentSnapshot> {
    this.hit('state', [])
    const s = ENGINE_FIXTURE.state
    return this.seeded ? { ...s, last_event_seq: this.seq } : { ...s, entities: [], hazards: [], routes: [], last_event_seq: this.seq }
  }

  async events(since: number) {
    this.hit('events', [since])
    const out = this.queue.filter((e) => e.seq > since)
    this.queue = []
    return out
  }

  async prediction() {
    this.hit('prediction', [])
    return ENGINE_FIXTURE.prediction
  }

  async prioritize() {
    this.hit('prioritize', [])
    return this.seeded ? ENGINE_FIXTURE.recommendations : []
  }

  async evacuation(id: string) {
    this.hit('evacuation', [id])
    return id in this.evacuationOverrides ? this.evacuationOverrides[id] : ENGINE_FIXTURE.evacuations[id] ?? null
  }

  async advisory(id: string) {
    this.hit('advisory', [id])
    return ENGINE_FIXTURE.advisories[id]
  }

  async reset() {
    this.hit('reset', [])
    this.seeded = false
    this.seq = 0
    this.queue = []
  }

  async report(text: string, civilianId?: string) {
    this.hit('report', [text, civilianId])
    this.seeded = true
    this.emit('civilian_report')
    const civilian = this.civilian(civilianId)
    return { civilian, report: civilian.report!, priority: civilian.priority! }
  }

  async moveCivilian(civilianId: string, nodeId: string) {
    this.hit('moveCivilian', [civilianId, nodeId])
    this.emit('entity_location_updated')
    return this.civilian(civilianId)
  }

  async addResponder(responderId: string, name: string, nodeId: string) {
    this.hit('addResponder', [responderId, name, nodeId])
    this.emit('entity_registered')
    return this.civilian()
  }

  async addHazard(hazardType: HazardType, nodeId: string) {
    this.hit('addHazard', [hazardType, nodeId])
    this.emit('hazard_added')
    return ENGINE_FIXTURE.state.hazards[0]
  }

  async removeHazard(hazardId: string) {
    this.hit('removeHazard', [hazardId])
    this.emit('hazard_removed')
  }

  async ignite(nodeId: string) {
    this.hit('ignite', [nodeId])
    this.emit('hazard_added')
  }

  async computeRoute(responderId: string, civilianId: string) {
    this.hit('computeRoute', [responderId, civilianId])
    this.emit('route_computed')
    return ENGINE_FIXTURE.state.routes.find((r) => r.route_id === rescueRouteId(responderId)) ?? ENGINE_FIXTURE.state.routes[0]
  }

  async observe(observation: Parameters<EngineClient['observe']>[0]) {
    this.hit('observe', [observation])
    this.emit('observation_ingested')
  }
}
```

`src/store/store.test.ts` (replace the Phase 1 file entirely):
```ts
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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -- src/store`
Expected: FAIL — `./engineSlice` not found (and the old slices no longer compile against the new types).

- [ ] **Step 5: Implement the store**

`src/store/types.ts`:
```ts
import type { StateCreator } from 'zustand'
import type { CommsSlice } from './commsSlice'
import type { EngineSlice } from './engineSlice'
import type { UiSlice } from './uiSlice'

export type SentinelState = EngineSlice &
  CommsSlice &
  UiSlice & {
    resetDemo: () => Promise<void>
  }

export type SliceCreator<T> = StateCreator<SentinelState, [['zustand/persist', unknown]], [], T>
```

`src/store/events.ts`:
```ts
import type { Message, Thread } from '../types'
import { threadIdFor } from '../data/scenarioThreads'
import { civilianStatus, civiliansOf, describeEvacuationChange, statusChangeText, type NodeIndex } from '../engine/derive'
import type { IncidentSnapshot, Route } from '../engine/types'
import { SYSTEM_SENDER } from '../lib/labels'

let sequence = 0

export function newMessageId(now: number): string {
  sequence += 1
  return `m-${now.toString(36)}-${sequence}`
}

export function systemMessage(civilianId: string, text: string, now: number): Message {
  return { id: newMessageId(now), threadId: threadIdFor(civilianId), from: 'system', sender: SYSTEM_SENDER, text, at: now }
}

type Observation = { snapshot: IncidentSnapshot | null; evacuations: Record<string, Route | null> }

/** System messages for status and evacuation-route changes between two engine observations. */
export function incidentChangeMessages(prev: Observation, next: Observation, nodes: NodeIndex, now: number): Message[] {
  if (!prev.snapshot) return []
  const before = new Map(civiliansOf(prev.snapshot).map((c) => [c.entity_id, c]))
  const messages: Message[] = []
  for (const civilian of civiliansOf(next.snapshot)) {
    const old = before.get(civilian.entity_id)
    if (!old) continue
    const status = civilianStatus(civilian, nodes)
    const statusText = statusChangeText(civilianStatus(old, nodes), status)
    if (statusText) messages.push(systemMessage(civilian.entity_id, statusText, now))
    if (status === 'evacuated') continue
    const routeText = describeEvacuationChange(prev.evacuations[civilian.entity_id], next.evacuations[civilian.entity_id], nodes)
    if (routeText) messages.push(systemMessage(civilian.entity_id, routeText, now))
  }
  return messages
}

/** Appends messages to their threads. Resident messages count as unread for responders. */
export function appendMessages(threads: Thread[], messages: Message[]): Thread[] {
  if (messages.length === 0) return threads
  return threads.map((t) => {
    const mine = messages.filter((m) => m.threadId === t.id)
    if (mine.length === 0) return t
    return { ...t, messages: [...t.messages, ...mine], unread: t.unread + mine.filter((m) => m.from === 'resident').length }
  })
}
```

`src/store/engineSlice.ts`:
```ts
import type { CameraSpec } from '../data/scenarioThreads'
import scenario from '../data/scenario.json'
import { EngineError, type EngineClient } from '../engine/client'
import { civiliansOf, indexNodes, nodePosition } from '../engine/derive'
import { latestSeq, needsRefresh } from '../engine/events'
import { ENGINE_FIXTURE } from '../engine/fixture'
import { getEngineClient } from '../engine/instance'
import type { Advisory, BuildingGraph, HazardType, IncidentSnapshot, Recommendation, Route, SpreadPrediction } from '../engine/types'
import { appendMessages, incidentChangeMessages } from './events'
import type { SliceCreator } from './types'

export const POLL_MS = 1500
export const RETRY_MS = 5000
export const FULL_REFRESH_MS = 15_000
export const STAGING_NODE = 'EXT_STAGING'
const DETECTION_CONFIDENCE = 0.82

export type EngineStatus = 'connecting' | 'live' | 'offline'

export type EngineData = {
  graph: BuildingGraph | null
  snapshot: IncidentSnapshot | null
  prediction: SpreadPrediction | null
  recommendations: Recommendation[]
  evacuations: Record<string, Route | null>
  advisories: Record<string, Advisory>
  lastSeq: number
  updatedAt: number
}

export type EngineSlice = EngineData & {
  engineStatus: EngineStatus
  engineError: string | null
  pending: boolean
  connect: () => Promise<void>
  poll: () => Promise<void>
  refresh: () => Promise<void>
  seed: () => Promise<void>
  resetIncident: () => Promise<boolean>
  reportCivilian: (civilianId: string, text: string) => Promise<boolean>
  moveCivilian: (civilianId: string, nodeId: string) => Promise<boolean>
  addHazard: (type: HazardType, nodeId: string) => Promise<boolean>
  removeHazard: (hazardId: string) => Promise<boolean>
  assignResponder: (responderId: string, civilianId: string) => Promise<boolean>
  simulateDetection: (camera: CameraSpec) => Promise<boolean>
}

export function emptyEngineData(): EngineData {
  return { graph: null, snapshot: null, prediction: null, recommendations: [], evacuations: {}, advisories: {}, lastSeq: 0, updatedAt: 0 }
}

export function fixtureData(now: number): EngineData {
  return {
    graph: ENGINE_FIXTURE.graph,
    snapshot: ENGINE_FIXTURE.state,
    prediction: ENGINE_FIXTURE.prediction,
    recommendations: ENGINE_FIXTURE.recommendations,
    evacuations: ENGINE_FIXTURE.evacuations,
    advisories: ENGINE_FIXTURE.advisories,
    lastSeq: 0,
    updatedAt: now,
  }
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err))
const isConnectionLoss = (err: unknown) => err instanceof EngineError && err.status === null

// Single-flight guards: StrictMode double effects and overlapping intervals must not seed or refresh twice.
let connecting: Promise<void> | null = null
let refreshing: Promise<void> | null = null
let polling = false

export const createEngineSlice: SliceCreator<EngineSlice> = (set, get) => {
  const goOffline = (err: unknown) => {
    const keepLiveData = get().engineStatus === 'live' && get().snapshot !== null
    set({ engineStatus: 'offline', engineError: messageOf(err), ...(keepLiveData ? {} : fixtureData(Date.now())) })
  }

  const runAction = async (action: (client: EngineClient) => Promise<unknown>): Promise<boolean> => {
    if (get().engineStatus !== 'live') {
      set({ engineError: 'Engine offline · changes are disabled' })
      return false
    }
    set({ pending: true })
    try {
      await action(getEngineClient())
      await get().refresh()
      set({ engineError: null })
      return true
    } catch (err) {
      if (isConnectionLoss(err)) goOffline(err)
      else set({ engineError: messageOf(err) })
      return false
    } finally {
      set({ pending: false })
    }
  }

  return {
    ...emptyEngineData(),
    engineStatus: 'connecting',
    engineError: null,
    pending: false,

    connect: () => {
      if (connecting) return connecting
      connecting = (async () => {
        try {
          const client = getEngineClient()
          set({ graph: await client.graph() })
          const snapshot = await client.state()
          if (civiliansOf(snapshot).length === 0) await get().seed()
          else await get().refresh()
          set({ engineStatus: 'live', engineError: null })
        } catch (err) {
          goOffline(err)
        } finally {
          connecting = null
        }
      })()
      return connecting
    },

    refresh: () => {
      if (refreshing) return refreshing
      refreshing = (async () => {
        try {
          const client = getEngineClient()
          const [snapshot, prediction, recommendations] = await Promise.all([client.state(), client.prediction(), client.prioritize()])
          const ids = civiliansOf(snapshot).map((c) => c.entity_id)
          const routes = await Promise.all(ids.map((id) => client.evacuation(id)))
          const evacuations: Record<string, Route | null> = Object.fromEntries(ids.map((id, i) => [id, routes[i]]))
          const viewing = get().viewingAsId
          const advisories = ids.includes(viewing) ? { ...get().advisories, [viewing]: await client.advisory(viewing) } : get().advisories
          const now = Date.now()
          // Only diff against live observations, never against the offline recording.
          const previous = get().engineStatus === 'live' ? { snapshot: get().snapshot, evacuations: get().evacuations } : { snapshot: null, evacuations: {} }
          const messages = incidentChangeMessages(previous, { snapshot, evacuations }, indexNodes(get().graph), now)
          set((s) => ({
            snapshot,
            prediction,
            recommendations,
            evacuations,
            advisories,
            lastSeq: Math.max(s.lastSeq, snapshot.last_event_seq),
            updatedAt: now,
            threads: appendMessages(s.threads, messages),
          }))
        } finally {
          refreshing = null
        }
      })()
      return refreshing
    },

    poll: async () => {
      if (get().engineStatus !== 'live') {
        await get().connect()
        return
      }
      if (polling) return
      polling = true
      try {
        const events = await getEngineClient().events(get().lastSeq)
        set({ lastSeq: latestSeq(events, get().lastSeq) })
        if (needsRefresh(events) || Date.now() - get().updatedAt > FULL_REFRESH_MS) await get().refresh()
      } catch (err) {
        if (isConnectionLoss(err)) goOffline(err)
        else set({ engineError: messageOf(err) })
      } finally {
        polling = false
      }
    },

    seed: async () => {
      const client = getEngineClient()
      await client.reset()
      set({ lastSeq: 0, snapshot: null, evacuations: {}, advisories: {} })
      for (const resident of scenario.residents) await client.report(resident.text)
      for (const responder of scenario.responders) await client.addResponder(responder.id, responder.name, responder.node)
      for (const node of scenario.ignite) await client.ignite(node)
      for (const hazard of scenario.hazards) await client.addHazard(hazard.type as HazardType, hazard.node)
      const recommendations = await client.prioritize()
      for (const [i, responder] of scenario.responders.entries()) {
        const rec = recommendations[i]
        if (rec) await client.computeRoute(responder.id, rec.civilian_id)
      }
      await get().refresh()
    },

    resetIncident: async () => {
      if (get().engineStatus !== 'live') {
        set(fixtureData(Date.now()))
        void get().connect()
        return false
      }
      set({ pending: true })
      try {
        await get().seed()
        return true
      } catch (err) {
        if (isConnectionLoss(err)) goOffline(err)
        else set({ engineError: messageOf(err) })
        return false
      } finally {
        set({ pending: false })
      }
    },

    reportCivilian: (civilianId, text) =>
      runAction(async (client) => {
        const prior = civiliansOf(get().snapshot).find((c) => c.entity_id === civilianId)?.report?.raw_text
        await client.report(prior ? `${prior} ${text}` : text, civilianId)
      }),

    moveCivilian: (civilianId, nodeId) => runAction((client) => client.moveCivilian(civilianId, nodeId)),

    addHazard: (type, nodeId) => runAction((client) => (type === 'fire' ? client.ignite(nodeId) : client.addHazard(type, nodeId))),

    removeHazard: (hazardId) => runAction((client) => client.removeHazard(hazardId)),

    assignResponder: (responderId, civilianId) => runAction((client) => client.computeRoute(responderId, civilianId)),

    simulateDetection: (camera) =>
      runAction(async (client) => {
        const node = get().graph?.nodes.find((n) => n.node_id === camera.nodeId)
        if (!node) throw new Error(`Camera ${camera.id} is not on a known node`)
        await client.observe({
          observation_id: `OBS_${camera.id}_${Date.now()}`,
          type: 'smoke',
          graph_node_id: node.node_id,
          world_position: nodePosition(node),
          camera_id: camera.id,
          confidence: DETECTION_CONFIDENCE,
        })
      }),
  }
}
```

`src/store/commsSlice.ts`:
```ts
import type { Message, QuickReply, Thread } from '../types'
import { threadIdFor } from '../data/scenarioThreads'
import { civiliansOf, indexNodes, placeLabel } from '../engine/derive'
import { MAX_MESSAGE_LENGTH, QUICK_REPLY_LABEL, QUICK_REPLY_REPORT_TEXT, RESPONDER_SENDER } from '../lib/labels'
import { STAGING_NODE } from './engineSlice'
import { appendMessages, newMessageId } from './events'
import type { SentinelState, SliceCreator } from './types'

export type CommsSlice = {
  threads: Thread[]
  sendMessage: (threadId: string, from: 'resident' | 'responder', text: string) => void
  sendQuickReply: (civilianId: string, reply: QuickReply) => void
  clearThread: (threadId: string) => void
  markRead: (threadId: string) => void
}

function residentName(state: SentinelState, civilianId: string | undefined): string {
  const civilian = civiliansOf(state.snapshot).find((c) => c.entity_id === civilianId)
  return civilian ? placeLabel(civilian, indexNodes(state.graph)) : 'Resident'
}

export const createCommsSlice =
  (initial: Thread[]): SliceCreator<CommsSlice> =>
  (set, get) => ({
    threads: initial,

    sendMessage: (threadId, from, raw) => {
      const text = raw.trim().slice(0, MAX_MESSAGE_LENGTH)
      if (!text) return
      const thread = get().threads.find((t) => t.id === threadId)
      if (!thread) return
      const now = Date.now()
      const message: Message = {
        id: newMessageId(now),
        threadId,
        from,
        sender: from === 'responder' ? RESPONDER_SENDER : residentName(get(), thread.personId),
        text,
        at: now,
      }
      set((s) => ({ threads: appendMessages(s.threads, [message]) }))
      if (from === 'resident' && thread.personId) void get().reportCivilian(thread.personId, text)
    },

    sendQuickReply: (civilianId, reply) => {
      const now = Date.now()
      const chip: Message = {
        id: newMessageId(now),
        threadId: threadIdFor(civilianId),
        from: 'resident',
        sender: residentName(get(), civilianId),
        text: QUICK_REPLY_LABEL[reply],
        quick: reply,
        at: now,
      }
      set((s) => ({ threads: appendMessages(s.threads, [chip]) }))
      void (reply === 'out' ? get().moveCivilian(civilianId, STAGING_NODE) : get().reportCivilian(civilianId, QUICK_REPLY_REPORT_TEXT[reply]))
    },

    clearThread: (threadId) =>
      set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, messages: [], unread: 0 } : t)) })),

    markRead: (threadId) => {
      const thread = get().threads.find((t) => t.id === threadId)
      if (!thread || thread.unread === 0) return
      set((s) => ({ threads: s.threads.map((t) => (t.id === threadId ? { ...t, unread: 0 } : t)) }))
    },
  })
```

`src/store/uiSlice.ts`:
```ts
import type { FloorFilter, GoStay, OverlayKind, Perspective, ResidentView, SimTool } from '../types'
import { CREW_THREAD_ID, DEFAULT_RESIDENT_ID, threadIdFor } from '../data/scenarioThreads'
import type { SliceCreator } from './types'

export type UiData = {
  perspective: Perspective
  viewingAsId: string
  selectedCivilianId: string | null
  hoveredCivilianId: string | null
  selectedThreadId: string
  overlays: Record<OverlayKind, boolean>
  floor: FloorFilter
  simMode: boolean
  simTool: SimTool
  moveSourceId: string | null
  residentView: ResidentView
  devGoStay: GoStay
  expandedCameraId: string | null
  composerFocusNonce: number
}

export type UiActions = {
  setPerspective: (perspective: Perspective) => void
  setViewingAs: (civilianId: string) => void
  selectCivilian: (civilianId: string | null) => void
  hoverCivilian: (civilianId: string | null) => void
  selectThread: (threadId: string) => void
  toggleOverlay: (kind: OverlayKind) => void
  setFloor: (floor: FloorFilter) => void
  setSimMode: (on: boolean) => void
  setSimTool: (tool: SimTool) => void
  setMoveSource: (civilianId: string | null) => void
  setResidentView: (view: ResidentView) => void
  setDevGoStay: (value: GoStay) => void
  setExpandedCamera: (cameraId: string | null) => void
  requestComposerFocus: () => void
}

export type UiSlice = UiData & UiActions

export function initialUi(perspective: Perspective = 'firefighter', viewingAsId: string = DEFAULT_RESIDENT_ID): UiData {
  return {
    perspective,
    viewingAsId,
    selectedCivilianId: null,
    hoveredCivilianId: null,
    selectedThreadId: CREW_THREAD_ID,
    overlays: { fire: true, smoke: true, risk: true },
    floor: 'all',
    simMode: false,
    simTool: 'fire',
    moveSourceId: null,
    residentView: 'building',
    devGoStay: 'auto',
    expandedCameraId: null,
    composerFocusNonce: 0,
  }
}

export const createUiSlice: SliceCreator<UiSlice> = (set, get) => ({
  ...initialUi(),
  setPerspective: (perspective) => set({ perspective }),
  setViewingAs: (viewingAsId) => {
    set({ viewingAsId })
    if (get().engineStatus === 'live') void get().refresh()
  },
  selectCivilian: (civilianId) => {
    if (civilianId === null) {
      set({ selectedCivilianId: null })
      return
    }
    const threadId = threadIdFor(civilianId)
    set({ selectedCivilianId: civilianId, selectedThreadId: threadId })
    get().markRead(threadId)
  },
  hoverCivilian: (hoveredCivilianId) => set({ hoveredCivilianId }),
  selectThread: (threadId) => {
    const thread = get().threads.find((t) => t.id === threadId)
    if (!thread) return
    set({ selectedThreadId: threadId, selectedCivilianId: thread.personId ?? null })
    get().markRead(threadId)
  },
  toggleOverlay: (kind) => set((s) => ({ overlays: { ...s.overlays, [kind]: !s.overlays[kind] } })),
  setFloor: (floor) => set({ floor }),
  setSimMode: (simMode) => set({ simMode, moveSourceId: null }),
  setSimTool: (simTool) => set({ simTool, moveSourceId: null }),
  setMoveSource: (moveSourceId) => set({ moveSourceId }),
  setResidentView: (residentView) => set({ residentView }),
  setDevGoStay: (devGoStay) => set({ devGoStay }),
  setExpandedCamera: (expandedCameraId) => set({ expandedCameraId }),
  requestComposerFocus: () => set((s) => ({ composerFocusNonce: s.composerFocusNonce + 1 })),
})
```

`src/store/index.ts`:
```ts
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Perspective, Thread } from '../types'
import { DEFAULT_RESIDENT_ID, seedThreads } from '../data/scenarioThreads'
import { createCommsSlice } from './commsSlice'
import { createEngineSlice } from './engineSlice'
import type { SentinelState } from './types'
import { createUiSlice, initialUi } from './uiSlice'

export type { SentinelState } from './types'

export const STORE_KEY = 'sentinel-jacobs'
export const STORE_VERSION = 2

type PersistedState = { threads: Thread[]; perspective: Perspective; viewingAsId: string }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const PERSPECTIVES: readonly unknown[] = ['firefighter', 'resident']

function isValidMessage(m: unknown): boolean {
  return isObject(m) && typeof m.id === 'string' && typeof m.from === 'string' && typeof m.sender === 'string' && typeof m.text === 'string' && typeof m.at === 'number'
}

function isValidThread(t: unknown): boolean {
  return isObject(t) && typeof t.id === 'string' && typeof t.unread === 'number' && Array.isArray(t.messages) && t.messages.every(isValidMessage)
}

export function isValidPersisted(value: unknown): value is PersistedState {
  return (
    isObject(value) &&
    Array.isArray(value.threads) &&
    value.threads.every(isValidThread) &&
    PERSPECTIVES.includes(value.perspective) &&
    typeof value.viewingAsId === 'string'
  )
}

export function mergePersisted(persisted: unknown, current: SentinelState): SentinelState {
  if (!isValidPersisted(persisted)) return current
  return { ...current, threads: persisted.threads, perspective: persisted.perspective, viewingAsId: persisted.viewingAsId }
}

const freshPersisted = (): PersistedState => ({ threads: seedThreads(Date.now()), perspective: 'firefighter', viewingAsId: DEFAULT_RESIDENT_ID })

export const useSentinel = create<SentinelState>()(
  persist(
    (set, get, api) => ({
      ...createEngineSlice(set, get, api),
      ...createCommsSlice(seedThreads(Date.now()))(set, get, api),
      ...createUiSlice(set, get, api),
      resetDemo: async () => {
        set({ threads: seedThreads(Date.now()), ...initialUi(get().perspective, get().viewingAsId) })
        await get().resetIncident()
      },
    }),
    {
      name: STORE_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => localStorage),
      partialize: (s): PersistedState => ({ threads: s.threads, perspective: s.perspective, viewingAsId: s.viewingAsId }),
      merge: (persisted, current) => mergePersisted(persisted, current),
      migrate: () => freshPersisted(),
    },
  ),
)
```

`src/store/selectors.ts`:
```ts
import { useMemo } from 'react'
import type { GoStay, Message, Thread } from '../types'
import { civiliansOf, indexNodes, respondersOf, type NodeIndex } from '../engine/derive'
import type { BuildingGraph, Entity, Route } from '../engine/types'
import { useSentinel } from './index'

let nodeCache: { graph: BuildingGraph | null; nodes: NodeIndex } = { graph: null, nodes: new Map() }

/** Memoized on graph identity; the graph loads once per session. */
export function nodesFor(graph: BuildingGraph | null): NodeIndex {
  if (nodeCache.graph !== graph) nodeCache = { graph, nodes: indexNodes(graph) }
  return nodeCache.nodes
}

export function useNodes(): NodeIndex {
  return nodesFor(useSentinel((s) => s.graph))
}

export function useCivilians(): Entity[] {
  const snapshot = useSentinel((s) => s.snapshot)
  return useMemo(() => civiliansOf(snapshot), [snapshot])
}

export function useResponders(): Entity[] {
  const snapshot = useSentinel((s) => s.snapshot)
  return useMemo(() => respondersOf(snapshot), [snapshot])
}

export function useEntity(id: string | null): Entity | undefined {
  return useSentinel((s) => (id ? s.snapshot?.entities.find((e) => e.entity_id === id) : undefined))
}

export function useThread(id: string): Thread | undefined {
  return useSentinel((s) => s.threads.find((t) => t.id === id))
}

/** Applies the demo Go/Stay override to a resident's evacuation route. */
export function effectiveEvacuation(route: Route | null | undefined, override: GoStay): Route | null {
  if (!route) return null
  if (override === 'stay') return { ...route, status: 'unreachable' }
  if (override === 'go' && route.polyline.length > 1) return { ...route, status: 'candidate' }
  return route
}

export function lastResidentMessage(thread: Thread | undefined): Message | undefined {
  return thread?.messages.filter((m) => m.from === 'resident').at(-1)
}
```

`src/engine/useEngineSync.ts`:
```ts
import { useEffect } from 'react'
import { useSentinel } from '../store'
import { POLL_MS, RETRY_MS } from '../store/engineSlice'

/** Connects once, then polls while live and retries every few seconds while offline. */
export function useEngineSync(): void {
  const status = useSentinel((s) => s.engineStatus)

  useEffect(() => {
    void useSentinel.getState().connect()
  }, [])

  useEffect(() => {
    const id = window.setInterval(() => void useSentinel.getState().poll(), status === 'live' ? POLL_MS : RETRY_MS)
    return () => window.clearInterval(id)
  }, [status])
}
```

- [ ] **Step 6: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: all tests PASS (store, engine, data, format, theme, tone). `tsc` reports no errors. If a component file from Phase 1 Tasks 7–8 imports a deleted module, it does not exist yet on this branch; there should be none.

- [ ] **Step 7: Commit**

```bash
git add -A src tests
git commit -m "feat: rebuild store on the sentinel engine with offline fallback"
```
(append the Co-Authored-By trailer)

---
### Task J6: UI primitives

**Files:** exactly Phase 1 Task 7's file list (`src/lib/cn.ts`, `src/lib/motion.ts`, `src/hooks/useNow.ts`, `src/hooks/useDismiss.ts`, `src/components/ui/*`, test `src/components/ui/tone.test.ts`).

**Interfaces:**
- Consumes: Tailwind tokens; `splitEmphasis`, `QUICK_REPLY_LABEL`, `QUICK_REPLY_TONE`; `CivilianStatus` from `src/engine/derive.ts`.
- Produces: everything Phase 1 Task 7 lists under "Produces" (Button, IconButton with `size="sm|md"`, SegmentedControl + `SegmentOption`, StatusDot, StatusChip, QuickReplyChip, Panel, PanelHeader, MonoText, InlineConfirm, Emphasis, tone maps, `cn`, `fade`, `fadeDrop`, `STANDARD`, `EASE_STANDARD`, `useNow`, `useDismiss`). `STATUS_TONE` is keyed by `CivilianStatus`.

- [ ] **Step 1: Implement Phase 1 Task 7 verbatim, with these changes only**

Follow Phase 1 Task 7 (`docs/superpowers/plans/2026-10-17-sentinel.md`, "### Task 7"), Steps 1–7, copying every code block exactly, except:

1. In `src/components/ui/tone.ts`, replace the `Status` import and `STATUS_TONE` with:
```ts
import type { CivilianStatus } from '../../engine/derive'
import type { Priority } from '../../types'
```
```ts
export const STATUS_TONE: Record<CivilianStatus, Tone> = {
  trapped: 'critical',
  immobile: 'critical',
  sheltering: 'moderate',
  evacuated: 'safe',
  unknown: 'neutral',
}
```
2. In `src/components/ui/tone.test.ts`, the "cover every status" expectation becomes:
```ts
    expect(Object.keys(STATUS_TONE).sort()).toEqual(['evacuated', 'immobile', 'sheltering', 'trapped', 'unknown'])
```
3. Commit message: `feat: add hand-built UI primitives with M3 state layers`.

---

### Task J7: App shell with engine status

**Files:**
- Create: Phase 1 Task 8's files (`src/components/layout/AppShell.tsx`, `TopBar.tsx`, `IncidentStatus.tsx`, `DevMenu.tsx`, `ErrorBoundary.tsx`, temporary `src/components/map/MapPanel.tsx`, temporary `src/components/comms/CommsPanel.tsx`), plus `src/components/layout/EngineStatus.tsx` and `src/components/layout/EngineBanner.tsx`
- Modify: `src/App.tsx`, `src/index.css` (scene label styles used later)

**Interfaces:**
- Consumes: store (`engineStatus`, `engineError`, `snapshot`, `connect`, `viewingAsId`, `setViewingAs`, `devGoStay`, `setDevGoStay`, `resetDemo`, `perspective`, `setPerspective`), `useCivilians`, `useNodes`, `placeLabel`, `useEngineSync`, UI primitives.
- Produces: `<AppShell />` that runs `useEngineSync()` and shows `<EngineBanner />` under the top bar; `<EngineStatus />` pill; `INCIDENT_NAME`, `INCIDENT_ADDRESS` constants in `IncidentStatus.tsx`; CSS classes `.scene-label`, `.scene-label--selected`, `.scene-room-label`, `.scene-floor-tag`.

- [ ] **Step 1: Implement Phase 1 Task 8 Steps 1–3 verbatim, with these changes**

Copy Phase 1 Task 8's code blocks (temporary panels, IncidentStatus, DevMenu, TopBar, ErrorBoundary, AppShell, App.tsx), then apply:

1. Replace `src/components/layout/IncidentStatus.tsx` with:
```tsx
import { useState } from 'react'
import { useNow } from '../../hooks/useNow'
import { formatElapsed } from '../../lib/format'
import { useSentinel } from '../../store'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'

export const INCIDENT_NAME = 'Jacobs Hall'
export const INCIDENT_ADDRESS = '2530 Ridge Rd, Berkeley'
const OFFLINE_ELAPSED_MS = 14 * 60_000

/** Elapsed time runs from the earliest civilian report on a live engine, or a fixed 14 minutes into the recording offline. */
function useIncidentStart(): number {
  const [loadedAt] = useState(() => Date.now())
  const live = useSentinel((s) => s.engineStatus === 'live')
  const snapshot = useSentinel((s) => s.snapshot)
  if (!live || !snapshot) return loadedAt - OFFLINE_ELAPSED_MS
  const times = snapshot.entities.map((e) => Date.parse(e.last_updated)).filter((t) => Number.isFinite(t))
  return times.length ? Math.min(...times) : loadedAt
}

export function IncidentStatus() {
  const startedAt = useIncidentStart()
  const now = useNow()
  return (
    <div className="flex items-center gap-4">
      <div className="hidden min-w-0 text-right lg:block">
        <div className="truncate text-14 font-medium">{INCIDENT_NAME}</div>
        <div className="truncate text-12 text-on-surface-variant">{INCIDENT_ADDRESS}</div>
      </div>
      <div className="flex items-center gap-2 text-12 font-medium text-error">
        <StatusDot tone="critical" />
        Active
      </div>
      <MonoText className="text-14 font-medium" aria-label="Elapsed time">
        {formatElapsed(now - startedAt)}
      </MonoText>
    </div>
  )
}
```

2. In `DevMenu.tsx`, replace the `people` selector and the `<select>` options with civilians from the engine:
```tsx
import { placeLabel } from '../../engine/derive'
import { useCivilians, useNodes } from '../../store/selectors'
```
```tsx
  const civilians = useCivilians()
  const nodes = useNodes()
```
```tsx
              {civilians.map((c) => (
                <option key={c.entity_id} value={c.entity_id}>
                  {placeLabel(c, nodes)} · {c.entity_id}
                </option>
              ))}
```
and the Reset button's `onClick` becomes `() => { void resetDemo(); setOpen(false) }`. Remove the now-unused `people` variable.

3. In `ErrorBoundary.tsx`, the reset handler calls `void useSentinel.getState().resetDemo()`.

4. Create `src/components/layout/EngineStatus.tsx`:
```tsx
import { useSentinel } from '../../store'
import type { EngineStatus as Status } from '../../store/engineSlice'
import { StatusDot } from '../ui/StatusDot'
import type { Tone } from '../ui/tone'

const LABEL: Record<Status, { text: string; tone: Tone }> = {
  live: { text: 'Engine live', tone: 'safe' },
  connecting: { text: 'Connecting', tone: 'neutral' },
  offline: { text: 'Engine offline', tone: 'moderate' },
}

export function EngineStatus() {
  const status = useSentinel((s) => s.engineStatus)
  const { text, tone } = LABEL[status]
  return (
    <span className="hidden items-center gap-2 text-12 font-medium text-on-surface-variant xl:flex" role="status">
      <StatusDot tone={tone} />
      {text}
    </span>
  )
}
```

5. Create `src/components/layout/EngineBanner.tsx`:
```tsx
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCw, ServerOff } from 'lucide-react'
import { fadeDrop } from '../../lib/motion'
import { useSentinel } from '../../store'
import { Button } from '../ui/Button'
import { MonoText } from '../ui/MonoText'

export function EngineBanner() {
  const status = useSentinel((s) => s.engineStatus)
  const error = useSentinel((s) => s.engineError)
  const connect = useSentinel((s) => s.connect)
  return (
    <AnimatePresence initial={false}>
      {status === 'offline' && (
        <motion.div {...fadeDrop} role="alert" className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-12 text-warning">
          <ServerOff size={16} strokeWidth={1.75} aria-hidden />
          <span className="font-medium">Engine offline · showing recorded incident.</span>
          <span className="hidden text-on-surface-variant md:inline">
            Start it with <MonoText>npm run engine</MonoText>.
          </span>
          {error && <MonoText className="hidden truncate text-11 text-on-surface-variant lg:inline">{error}</MonoText>}
          <span className="flex-1" />
          <Button variant="ghost" size="sm" icon={RotateCw} onClick={() => void connect()}>
            Retry
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

6. In `TopBar.tsx`, render `<EngineStatus />` immediately before `<IncidentStatus />` (import it from `./EngineStatus`).

7. In `AppShell.tsx`, import `useEngineSync` from `../../engine/useEngineSync` and `EngineBanner` from `./EngineBanner`; call `useEngineSync()` at the top of the component and render `<EngineBanner />` directly after `<TopBar />`.

8. Append to `src/index.css` inside `@layer components`:
```css
  .scene-label {
    @apply rounded-8 border border-outline bg-surface px-1.5 font-mono text-11 font-medium text-on-surface;
    white-space: nowrap;
    transform: translateY(-18px);
    pointer-events: none;
  }
  .scene-label--selected {
    @apply border-primary text-primary;
  }
  .scene-room-label {
    @apply text-11 text-on-surface-variant;
    white-space: nowrap;
    pointer-events: none;
  }
  .scene-floor-tag {
    @apply font-mono text-12 font-semibold text-on-surface-variant;
    pointer-events: none;
  }
```

- [ ] **Step 2: Verify**

Run: `npm test && npm run build`
Expected: tests PASS; build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/index.css src/components/layout src/components/map/MapPanel.tsx src/components/comms/CommsPanel.tsx
git commit -m "feat: add app shell with engine status, offline banner and demo controls"
```
(append the Co-Authored-By trailer). Browser check is done by the controller.

---

### Task J8: Three.js building view

**Files:**
- Modify: `package.json` (add `three`, `@types/three`), `vite.config.ts` (`@demo` alias)
- Create: `src/components/building3d/coords.ts`, `palette.ts`, `types.ts`, `demoAdapter.ts`, `demo-modules.d.ts`, `sceneData.ts`, `BuildingScene.ts`, `BuildingView3D.tsx`
- Test: `src/components/building3d/coords.test.ts`, `palette.test.ts`, `sceneData.test.ts`

**Interfaces:**
- Consumes: `FOOTPRINTS`, `FURNISHINGS`, `ENTRANCES`, `SHELL`, `footprintFor` (J3); engine types; derive helpers (`civilianTone`, `peopleCount`, `placeLabel`); `RESPONDER_LABEL`; demo builders `makeFurnishing(view, parent, prop, baseY)` and `makeFirefighter(view, color)` from `demo/src` (read-only).
- Produces:
  - `toScene(x, y, floor, lift?) → THREE.Vector3`, `floorY(floor)`, `ORIGIN`, `FLOOR_SPACING`, `SLAB`
  - `PALETTE`, `TOKEN_HEXES`, `TONE_HEX`, `toPaletteNeutral(hex)`, `paletteColor(hex)`, `riskOpacity(risk)`
  - `SceneMarker`, `SceneHazard`, `ScenePath`, `SceneInput`, `SceneCallbacks`
  - `shortLabel(label)`, `buildMarkers(civilians, responders, nodes, { selectedId, hoveredId })`, `buildHazards(hazards, nodes, edges)`, `buildPaths(routes, evacuation, focusCivilianId)`
  - `BuildingScene` class (`update(input)`, `dispose()`)
  - `<BuildingView3D {...SceneInput} onPickEntity? onPickNode? onPickHazard? className? />`

- [ ] **Step 1: Install three**

Run: `npm view @types/three versions --json | tail -20`, pick the highest `0.186.x` (if none exists, the highest version below 0.186 and note it in the report), then:
```bash
npm install three@0.186.1
npm install -D @types/three@<chosen version>
```
Expected: installs cleanly.

Then add the `@demo` alias so the read-only demo builders import with a non-relative specifier (TypeScript only applies ambient module declarations to non-relative names). Replace `vite.config.ts` with:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@demo': fileURLToPath(new URL('./demo/src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
})
```
(Keep any other `test` options already present in the current file, such as `setupFiles`.)

- [ ] **Step 2: Write the failing tests**

`src/components/building3d/coords.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { floorY, toScene } from './coords'

describe('toScene', () => {
  it('centers the building and maps north to -z', () => {
    const p = toScene(20, 10, 'F1')
    expect([p.x, p.y, p.z]).toEqual([0, 0, -0])
    const north = toScene(20, 20, 'F1')
    expect(north.z).toBe(-10)
  })

  it('stacks floors with exaggerated spacing', () => {
    expect(floorY('B')).toBe(-7)
    expect(floorY('F3')).toBe(14)
    expect(toScene(0, 0, 'F2', 0.5).y).toBe(7.5)
  })
})
```

`src/components/building3d/palette.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { PALETTE, TOKEN_HEXES, paletteColor, riskOpacity, toPaletteNeutral } from './palette'

describe('palette', () => {
  it('maps arbitrary demo colors onto neutral tokens', () => {
    expect(TOKEN_HEXES.has(toPaletteNeutral(0xd2ac73))).toBe(true)
    expect(toPaletteNeutral(0x202c32)).toBe(PALETTE.onSurface)
    expect(toPaletteNeutral(0xffffff)).toBe(PALETTE.surface)
  })

  it('keeps colors that already are tokens', () => {
    expect(paletteColor(PALETTE.primary)).toBe(PALETTE.primary)
    expect(paletteColor(PALETTE.error)).toBe(PALETTE.error)
  })

  it('scales risk into a capped opacity and drops negligible risk', () => {
    expect(riskOpacity(1)).toBeCloseTo(0.45)
    expect(riskOpacity(0.5)).toBeCloseTo(0.225)
    expect(riskOpacity(0.02)).toBe(0)
    expect(riskOpacity(3)).toBeCloseTo(0.45)
  })
})
```

`src/components/building3d/sceneData.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { civiliansOf, indexNodes, respondersOf } from '../../engine/derive'
import { ENGINE_FIXTURE } from '../../engine/fixture'
import { buildHazards, buildMarkers, buildPaths, shortLabel } from './sceneData'

const nodes = indexNodes(ENGINE_FIXTURE.graph)
const civilians = civiliansOf(ENGINE_FIXTURE.state)
const responders = respondersOf(ENGINE_FIXTURE.state)

describe('shortLabel', () => {
  it('uses room numbers, else initials', () => {
    expect(shortLabel('Studio 210')).toBe('210')
    expect(shortLabel('Advanced Prototyping Lab')).toBe('APL')
    expect(shortLabel('Metal Shop')).toBe('MS')
  })
})

describe('buildMarkers', () => {
  const markers = buildMarkers(civilians, responders, nodes, { selectedId: 'CIV_002', hoveredId: null })

  it('places every located entity once', () => {
    expect(markers).toHaveLength(civilians.length + responders.length)
    expect(markers.find((m) => m.id === 'CIV_001')).toMatchObject({ kind: 'civilian', floor: 'F2', label: '210 · 2', tone: 'critical' })
    expect(markers.find((m) => m.id === 'CIV_002')?.selected).toBe(true)
  })

  it('spreads entities that share a node', () => {
    const atStaging = markers.filter((m) => m.kind === 'responder')
    expect(atStaging).toHaveLength(2)
    expect(atStaging[0].x === atStaging[1].x && atStaging[0].y === atStaging[1].y).toBe(false)
    expect(atStaging.map((m) => m.label)).toEqual(['Alpha', 'Bravo'])
  })
})

describe('buildHazards', () => {
  it('positions node hazards at their node', () => {
    const hazards = buildHazards(ENGINE_FIXTURE.state.hazards, nodes, ENGINE_FIXTURE.graph.edges)
    expect(hazards.find((h) => h.type === 'fire')).toMatchObject({ floor: 'F2', x: 28, y: 10 })
  })

  it('positions edge hazards at the edge midpoint', () => {
    const edge = ENGINE_FIXTURE.graph.edges[0]
    const [h] = buildHazards([{ ...ENGINE_FIXTURE.state.hazards[0], hazard_id: 'E', node_id: null, edge_id: edge.edge_id }], nodes, ENGINE_FIXTURE.graph.edges)
    const a = nodes.get(edge.from_node)!
    const b = nodes.get(edge.to_node)!
    expect(h).toMatchObject({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, floor: a.floor_id })
  })
})

describe('buildPaths', () => {
  it('draws assigned rescue routes and the focused evacuation route', () => {
    const evac = ENGINE_FIXTURE.evacuations.CIV_003
    const paths = buildPaths(ENGINE_FIXTURE.state.routes, evac, 'CIV_003')
    expect(paths.filter((p) => p.variant === 'rescue')).toHaveLength(2)
    expect(paths.find((p) => p.variant === 'evacuation')?.id).toBe('EVAC_CIV_003')
  })

  it('emphasizes the rescue route to the focused civilian and dims the rest', () => {
    const target = ENGINE_FIXTURE.state.routes[0].meta?.civilian_id ?? ''
    const paths = buildPaths(ENGINE_FIXTURE.state.routes, null, target)
    expect(paths.find((p) => p.id === ENGINE_FIXTURE.state.routes[0].route_id)?.emphasized).toBe(true)
    expect(paths.filter((p) => p.dimmed)).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- src/components/building3d`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement coords, palette, types, scene data**

`src/components/building3d/coords.ts`:
```ts
import * as THREE from 'three'
import { FLOOR_ELEVATION, type FloorId } from '../../engine/types'

/** Engine point at the center of the 40×20 m footprint becomes the scene origin. */
export const ORIGIN = { x: 20, y: 10 } as const
/** Scene units per meter of elevation: 4 m floors are drawn 7 units apart so every floor stays visible. */
export const FLOOR_SPACING = 7 / 4
export const SLAB = 0.25

export function floorY(floor: FloorId): number {
  return FLOOR_ELEVATION[floor] * FLOOR_SPACING
}

export function toScene(x: number, y: number, floor: FloorId, lift = 0): THREE.Vector3 {
  return new THREE.Vector3(x - ORIGIN.x, floorY(floor) + lift, -(y - ORIGIN.y))
}
```

`src/components/building3d/palette.ts`:
```ts
import type { Priority } from '../../types'

/** The M3 token palette as three.js hex numbers. Nothing else is drawn. */
export const PALETTE = {
  surface: 0xfbf9f6,
  surfaceContainer: 0xf3f1ee,
  surfaceContainerHigh: 0xeceae7,
  onSurface: 0x1c1b19,
  onSurfaceVariant: 0x5f5e5a,
  outline: 0xc8c6c2,
  primary: 0x1f4e79,
  error: 0xb3261e,
  warning: 0x8a5a00,
  success: 0x2e6b3f,
} as const

export const TOKEN_HEXES: ReadonlySet<number> = new Set(Object.values(PALETTE))

export const TONE_HEX: Record<Priority, number> = { critical: PALETTE.error, moderate: PALETTE.warning, safe: PALETTE.success }

const NEUTRALS = [PALETTE.surface, PALETTE.surfaceContainer, PALETTE.surfaceContainerHigh, PALETTE.outline, PALETTE.onSurfaceVariant, PALETTE.onSurface]
const MAX_RISK_OPACITY = 0.45
const MIN_VISIBLE_RISK = 0.05

function luminance(hex: number): number {
  const r = (hex >> 16) & 0xff
  const g = (hex >> 8) & 0xff
  const b = hex & 0xff
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/** Nearest neutral token by luminance, so demo furniture keeps its light/dark structure inside the palette. */
export function toPaletteNeutral(hex: number): number {
  const target = luminance(hex)
  return NEUTRALS.reduce((best, c) => (Math.abs(luminance(c) - target) < Math.abs(luminance(best) - target) ? c : best))
}

export function paletteColor(hex: number): number {
  return TOKEN_HEXES.has(hex) ? hex : toPaletteNeutral(hex)
}

export function riskOpacity(risk: number): number {
  if (risk < MIN_VISIBLE_RISK) return 0
  return Math.min(MAX_RISK_OPACITY, risk * MAX_RISK_OPACITY)
}
```

`src/components/building3d/types.ts`:
```ts
import type { FloorId, HazardType, WorldPosition } from '../../engine/types'
import type { FloorFilter, Priority } from '../../types'

export type SceneMarker = {
  id: string
  kind: 'civilian' | 'responder'
  floor: FloorId
  x: number
  y: number
  label: string
  tone: Priority
  selected?: boolean
  emphasized?: boolean
}
export type SceneHazard = { id: string; type: HazardType; floor: FloorId; x: number; y: number }
export type ScenePath = { id: string; points: WorldPosition[]; variant: 'rescue' | 'evacuation'; emphasized?: boolean; dimmed?: boolean }

export type SceneInput = {
  markers: SceneMarker[]
  hazards: SceneHazard[]
  paths: ScenePath[]
  risk: Record<string, number>
  showFire: boolean
  showSmoke: boolean
  showRisk: boolean
  floor: FloorFilter
  /** Resident view: dim every floor except this one. */
  focusFloor?: FloorId | null
  highlightNodeId?: string | null
  highlightTone?: 'primary' | 'warning'
  /** Sim mode: clicking a room or corridor reports its node. */
  pickableNodes?: boolean
}

export type SceneCallbacks = {
  onPickEntity?: (id: string) => void
  onPickNode?: (nodeId: string) => void
  onPickHazard?: (hazardId: string) => void
}
```

`src/components/building3d/sceneData.ts`:
```ts
import { civilianTone, peopleCount, placeLabel, type NodeIndex } from '../../engine/derive'
import type { Entity, GraphEdge, Hazard, Route } from '../../engine/types'
import { RESPONDER_LABEL } from '../../lib/labels'
import type { SceneHazard, SceneMarker, ScenePath } from './types'

const SPREAD_M = 1.1
const SPREAD_ANGLE = 2.4

export function shortLabel(label: string): string {
  const number = label.match(/\b\d{2,3}\b/)
  if (number) return number[0]
  return label
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 3)
}

export function buildMarkers(
  civilians: Entity[],
  responders: Entity[],
  nodes: NodeIndex,
  { selectedId, hoveredId }: { selectedId: string | null; hoveredId: string | null },
): SceneMarker[] {
  const perNode = new Map<string, number>()
  const place = (e: Entity, kind: SceneMarker['kind'], label: string, tone: SceneMarker['tone']): SceneMarker[] => {
    const node = e.graph_node_id ? nodes.get(e.graph_node_id) : undefined
    if (!node) return []
    const index = perNode.get(node.node_id) ?? 0
    perNode.set(node.node_id, index + 1)
    const radius = index === 0 ? 0 : SPREAD_M
    return [{
      id: e.entity_id,
      kind,
      floor: node.floor_id,
      x: node.x + Math.cos(index * SPREAD_ANGLE) * radius,
      y: node.y + Math.sin(index * SPREAD_ANGLE) * radius,
      label,
      tone,
      selected: e.entity_id === selectedId,
      emphasized: e.entity_id === hoveredId,
    }]
  }
  return [
    ...civilians.flatMap((c) => place(c, 'civilian', `${shortLabel(placeLabel(c, nodes))} · ${peopleCount(c)}`, civilianTone(c, nodes))),
    ...responders.flatMap((r) => place(r, 'responder', RESPONDER_LABEL[r.entity_id] ?? r.name ?? r.entity_id, 'safe')),
  ]
}

export function buildHazards(hazards: Hazard[], nodes: NodeIndex, edges: GraphEdge[]): SceneHazard[] {
  return hazards.flatMap((h): SceneHazard[] => {
    const node = h.node_id ? nodes.get(h.node_id) : undefined
    if (node) return [{ id: h.hazard_id, type: h.hazard_type, floor: node.floor_id, x: node.x, y: node.y }]
    const edge = h.edge_id ? edges.find((e) => e.edge_id === h.edge_id) : undefined
    const a = edge ? nodes.get(edge.from_node) : undefined
    const b = edge ? nodes.get(edge.to_node) : undefined
    if (!a || !b) return []
    return [{ id: h.hazard_id, type: h.hazard_type, floor: a.floor_id, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }]
  })
}

export function buildPaths(routes: Route[], evacuation: Route | null | undefined, focusCivilianId: string | null): ScenePath[] {
  const rescue: ScenePath[] = routes
    .filter((r) => r.meta?.responder_id && r.status === 'candidate' && r.polyline.length > 1)
    .map((r) => ({
      id: r.route_id,
      points: r.polyline,
      variant: 'rescue',
      emphasized: focusCivilianId !== null && r.meta?.civilian_id === focusCivilianId,
      dimmed: focusCivilianId !== null && r.meta?.civilian_id !== focusCivilianId,
    }))
  const evac: ScenePath[] =
    evacuation && evacuation.status === 'candidate' && evacuation.polyline.length > 1
      ? [{ id: evacuation.route_id, points: evacuation.polyline, variant: 'evacuation', emphasized: true }]
      : []
  return [...rescue, ...evac]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/components/building3d`
Expected: PASS (11 tests).

- [ ] **Step 6: Implement the demo adapter and module declarations**

`src/components/building3d/demo-modules.d.ts`:
```ts
// Typed entry points into the teammate's demo builders (demo/src, plain JS, read-only).
declare module '@demo/furnishings.js' {
  import type { Group, Object3D } from 'three'
  export function makeFurnishing(
    view: unknown,
    parent: Object3D,
    prop: { id: string; room: string; kind: string; x: number; z: number; w: number; d: number; h: number },
    baseY: number,
  ): Group
}

declare module '@demo/response-view.js' {
  import type { Group } from 'three'
  export function makeFirefighter(view: unknown, color: number): Group
}
```

`src/components/building3d/demoAdapter.ts`:
```ts
import * as THREE from 'three'
import { paletteColor } from './palette'

type Vec3 = [number, number, number]

/** The `view` object the demo builders expect (box/material/line), with every color mapped onto the token palette. */
export class DemoViewAdapter {
  private materials = new Map<string, THREE.MeshStandardMaterial>()

  material(color: number, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const mapped = paletteColor(color)
    const emissive = typeof options.emissive === 'number' ? paletteColor(options.emissive) : undefined
    const key = `${mapped}-${JSON.stringify({ ...options, emissive })}`
    const cached = this.materials.get(key)
    if (cached) return cached
    const created = new THREE.MeshStandardMaterial({ roughness: 0.85, ...options, color: mapped, ...(emissive === undefined ? {} : { emissive }) })
    this.materials.set(key, created)
    return created
  }

  box(parent: THREE.Object3D, size: Vec3, pos: Vec3, color: number, options?: THREE.MeshStandardMaterialParameters): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), this.material(color, options))
    mesh.position.set(...pos)
    parent.add(mesh)
    return mesh
  }

  line(parent: THREE.Object3D, points: Vec3[], color: number, opacity = 1): THREE.Line {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)))
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: paletteColor(color), transparent: opacity < 1, opacity }))
    parent.add(line)
    return line
  }

  dispose(): void {
    for (const m of this.materials.values()) m.dispose()
    this.materials.clear()
  }
}
```

- [ ] **Step 7: Implement the scene**

`src/components/building3d/BuildingScene.ts`:
```ts
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import { makeFurnishing } from '@demo/furnishings.js'
import { makeFirefighter } from '@demo/response-view.js'
import { ENTRANCES, FOOTPRINTS, FURNISHINGS, SHELL, footprintFor, type Footprint } from '../../data/jacobsLayout'
import { FLOOR_IDS, type FloorId, type WorldPosition } from '../../engine/types'
import { SLAB, floorY, toScene } from './coords'
import { DemoViewAdapter } from './demoAdapter'
import { PALETTE, TONE_HEX, riskOpacity } from './palette'
import type { SceneCallbacks, SceneHazard, SceneInput, SceneMarker, ScenePath } from './types'

const CLICK_SLOP_PX = 5
const PLATE_LIFT = 0.02
const WALL_HEIGHT = 1.2
const ROUTE_LIFT = 0.6
const DASH = 0.8
const GAP = 0.5
const CAMERA_HOME = new THREE.Vector3(34, 36, 44)

const PLATE_COLOR: Record<Footprint['kind'], number> = {
  room: PALETTE.surface,
  corridor: PALETTE.surfaceContainerHigh,
  stairs: PALETTE.surfaceContainer,
  elevator: PALETTE.outline,
  lobby: PALETTE.surfaceContainer,
  staging: PALETTE.surfaceContainer,
}

type FloorKey = FloorId | 'site'

export class BuildingScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly labels = new CSS2DRenderer()
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500)
  private readonly controls: OrbitControls
  private readonly view = new DemoViewAdapter()
  private readonly materials = new Map<string, THREE.Material>()
  private readonly floors = new Map<FloorKey, THREE.Group>()
  private readonly roomLabels: CSS2DObject[] = []
  private readonly plates: THREE.Mesh[] = []
  private dynamic = new THREE.Group()
  private markerPicks: THREE.Object3D[] = []
  private hazardPicks: THREE.Object3D[] = []
  private input: SceneInput | null = null
  private frame = 0
  private downAt: { x: number; y: number } | null = null
  private readonly raycaster = new THREE.Raycaster()
  private readonly resizeObserver: ResizeObserver

  constructor(private readonly container: HTMLElement, private readonly callbacks: SceneCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setClearColor(PALETTE.surface)
    container.appendChild(this.renderer.domElement)
    Object.assign(this.labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
    container.appendChild(this.labels.domElement)

    this.camera.position.copy(CAMERA_HOME)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 3, 0)
    this.controls.enableDamping = true
    this.controls.maxPolarAngle = Math.PI * 0.48
    this.controls.minDistance = 16
    this.controls.maxDistance = 130

    this.scene.add(new THREE.HemisphereLight(PALETTE.surface, PALETTE.outline, 2.2))
    const sun = new THREE.DirectionalLight(PALETTE.surface, 1.6)
    sun.position.set(20, 45, 30)
    this.scene.add(sun)

    this.buildStatic()
    this.scene.add(this.dynamic)

    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp)
    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.animate()
  }

  update(input: SceneInput): void {
    const floorChanged = this.input?.floor !== input.floor
    this.input = input
    this.applyFloorVisibility()
    this.rebuildDynamic()
    if (floorChanged) this.frameFloor()
  }

  dispose(): void {
    cancelAnimationFrame(this.frame)
    this.resizeObserver.disconnect()
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown)
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp)
    this.controls.dispose()
    this.clearGroup(this.dynamic)
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose()
    })
    for (const m of this.materials.values()) m.dispose()
    this.view.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.labels.domElement.remove()
  }

  // ---------- static building ----------

  private mat(color: number, opacity = 1, extra: THREE.MeshStandardMaterialParameters = {}): THREE.Material {
    const key = `${color}-${opacity}-${JSON.stringify(extra)}`
    const cached = this.materials.get(key)
    if (cached) return cached
    const created = new THREE.MeshStandardMaterial({ color, roughness: 0.9, transparent: opacity < 1, opacity, depthWrite: opacity >= 1, ...extra })
    this.materials.set(key, created)
    return created
  }

  private lineMat(color: number, opacity = 1): THREE.LineBasicMaterial {
    const key = `line-${color}-${opacity}`
    const cached = this.materials.get(key)
    if (cached) return cached as THREE.LineBasicMaterial
    const created = new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity })
    this.materials.set(key, created)
    return created
  }

  private label(parent: THREE.Object3D, text: string, pos: THREE.Vector3, className: string): CSS2DObject {
    const el = document.createElement('div')
    el.className = className
    el.textContent = text
    const obj = new CSS2DObject(el)
    obj.position.copy(pos)
    parent.add(obj)
    return obj
  }

  private floorGroup(key: FloorKey): THREE.Group {
    const existing = this.floors.get(key)
    if (existing) return existing
    const group = new THREE.Group()
    this.floors.set(key, group)
    this.scene.add(group)
    return group
  }

  private boxBetween(fp: { x0: number; y0: number; x1: number; y1: number }, floor: FloorId, height: number, lift: number): { size: THREE.Vector3; center: THREE.Vector3 } {
    const size = new THREE.Vector3(fp.x1 - fp.x0, height, fp.y1 - fp.y0)
    const center = toScene((fp.x0 + fp.x1) / 2, (fp.y0 + fp.y1) / 2, floor, lift + height / 2)
    return { size, center }
  }

  private buildStatic(): void {
    for (const floor of FLOOR_IDS) {
      const group = this.floorGroup(floor)
      const slab = this.boxBetween(SHELL, floor, SLAB, -SLAB)
      const slabMesh = new THREE.Mesh(new THREE.BoxGeometry(slab.size.x, slab.size.y, slab.size.z), this.mat(PALETTE.surfaceContainer))
      slabMesh.position.copy(slab.center)
      group.add(slabMesh)
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(slabMesh.geometry), this.lineMat(PALETTE.outline))
      edges.position.copy(slab.center)
      group.add(edges)
      this.label(group, floor, toScene(SHELL.x0 - 2.5, (SHELL.y0 + SHELL.y1) / 2, floor, 0.2), 'scene-floor-tag')
    }

    for (const fp of FOOTPRINTS) {
      const group = this.floorGroup(fp.kind === 'staging' ? 'site' : fp.floor)
      const plate = this.boxBetween(fp, fp.floor, 0.05, PLATE_LIFT)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(plate.size.x, plate.size.y, plate.size.z), this.mat(PLATE_COLOR[fp.kind]))
      mesh.position.copy(plate.center)
      mesh.userData = { nodeId: fp.nodeId }
      group.add(mesh)
      if (fp.nodeId) this.plates.push(mesh)
      if (fp.kind === 'room' || fp.kind === 'stairs' || fp.kind === 'elevator') {
        const walls = this.boxBetween(fp, fp.floor, WALL_HEIGHT, PLATE_LIFT)
        const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(walls.size.x, walls.size.y, walls.size.z)), this.lineMat(PALETTE.outline))
        outline.position.copy(walls.center)
        group.add(outline)
      }
      if (fp.kind === 'staging') {
        const ring = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), this.lineMat(PALETTE.onSurfaceVariant, 0.6))
        ring.position.copy(plate.center)
        group.add(ring)
      }
      if (fp.kind === 'room' || fp.kind === 'staging' || fp.kind === 'lobby') {
        const text = this.label(group, fp.label, toScene((fp.x0 + fp.x1) / 2, fp.y1 - 1, fp.floor, 0.3), 'scene-room-label')
        if (fp.kind !== 'staging') this.roomLabels.push(text)
      }
    }

    for (const item of FURNISHINGS) {
      const room = footprintFor(item.nodeId)
      if (!room) continue
      const at = toScene(item.x, item.y, room.floor)
      makeFurnishing(this.view, this.floorGroup(room.floor), { id: item.id, room: item.nodeId, kind: item.kind, x: at.x, z: at.z, w: item.w, d: item.d, h: item.h }, floorY(room.floor) + PLATE_LIFT)
    }

    const site = this.floorGroup('site')
    for (const entrance of ENTRANCES) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.4), this.mat(PALETTE.success))
      door.position.copy(toScene(entrance.x, entrance.y, 'F1', 0.1))
      site.add(door)
      this.label(site, entrance.label, toScene(entrance.x, entrance.y - 1.5, 'F1', 0.2), 'scene-room-label')
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(110, 80), this.mat(PALETTE.surfaceContainer, 0.35))
    ground.rotation.x = -Math.PI / 2
    ground.position.set(0, -SLAB - 0.01, 4)
    site.add(ground)
  }

  // ---------- dynamic layers ----------

  private clearGroup(group: THREE.Group): void {
    group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
      if (o instanceof CSS2DObject) o.element.remove()
    })
    group.clear()
  }

  private rebuildDynamic(): void {
    const input = this.input
    if (!input) return
    this.clearGroup(this.dynamic)
    this.markerPicks = []
    this.hazardPicks = []
    if (input.showRisk) this.addRisk(input.risk)
    for (const hazard of input.hazards) {
      if ((hazard.type === 'fire' && !input.showFire) || (hazard.type === 'smoke' && !input.showSmoke)) continue
      this.addHazard(hazard)
    }
    for (const path of input.paths) this.addPath(path)
    for (const marker of input.markers) this.addMarker(marker)
    if (input.highlightNodeId) this.addHighlight(input.highlightNodeId, input.highlightTone ?? 'primary')
    if (input.focusFloor) this.addVeils(input.focusFloor)
    this.applyFloorVisibility()
  }

  private visible(floor: FloorId): boolean {
    const filter = this.input?.floor ?? 'all'
    return filter === 'all' || filter === floor
  }

  private addRisk(risk: Record<string, number>): void {
    for (const [nodeId, value] of Object.entries(risk)) {
      const fp = footprintFor(nodeId)
      const opacity = riskOpacity(value)
      if (!fp || opacity === 0 || fp.kind === 'staging') continue
      const plate = this.boxBetween(fp, fp.floor, 0.06, PLATE_LIFT + 0.05)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(plate.size.x, plate.size.y, plate.size.z), this.mat(PALETTE.error, Number(opacity.toFixed(2))))
      mesh.position.copy(plate.center)
      mesh.userData = { floor: fp.floor }
      this.dynamic.add(mesh)
    }
  }

  private addHazard(hazard: SceneHazard): void {
    const group = new THREE.Group()
    group.position.copy(toScene(hazard.x, hazard.y, hazard.floor, PLATE_LIFT))
    group.userData = { floor: hazard.floor, hazardId: hazard.id }
    if (hazard.type === 'fire') {
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.05, 32), this.mat(PALETTE.error, 0.35))
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 16), this.mat(PALETTE.error))
      flame.position.y = 0.9
      group.add(disc, flame)
    } else if (hazard.type === 'smoke') {
      const cloud = new THREE.Mesh(new THREE.SphereGeometry(1.7, 20, 14), this.mat(PALETTE.onSurfaceVariant, 0.22))
      cloud.position.y = 1.6
      group.add(cloud)
    } else {
      for (const angle of [Math.PI / 4, -Math.PI / 4]) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 0.25), this.mat(PALETTE.warning))
        bar.position.y = 0.6
        bar.rotation.y = angle
        group.add(bar)
      }
    }
    this.dynamic.add(group)
    this.hazardPicks.push(group)
  }

  private segment(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, floor: FloorId): THREE.Mesh {
    const delta = to.clone().sub(from)
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 8), material)
    mesh.position.copy(from.clone().add(to).multiplyScalar(0.5))
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize())
    mesh.userData = { floor }
    return mesh
  }

  private addPath(path: ScenePath): void {
    const radius = path.emphasized ? 0.2 : 0.14
    const material = this.mat(PALETTE.primary, path.dimmed ? 0.3 : 1)
    const points = path.points.map((p: WorldPosition) => toScene(p.x, p.y, p.floor_id, ROUTE_LIFT))
    for (let i = 1; i < points.length; i++) {
      const floor = path.points[i].floor_id
      if (path.variant === 'rescue') {
        this.dynamic.add(this.segment(points[i - 1], points[i], radius, material, floor))
        continue
      }
      const length = points[i - 1].distanceTo(points[i])
      for (let start = 0; start < length; start += DASH + GAP) {
        const a = points[i - 1].clone().lerp(points[i], start / length)
        const b = points[i - 1].clone().lerp(points[i], Math.min(1, (start + DASH) / length))
        this.dynamic.add(this.segment(a, b, radius, material, floor))
      }
    }
  }

  private addMarker(marker: SceneMarker): void {
    const group = new THREE.Group()
    group.position.copy(toScene(marker.x, marker.y, marker.floor, PLATE_LIFT))
    group.userData = { floor: marker.floor, entityId: marker.id }
    if (marker.kind === 'responder') {
      group.add(makeFirefighter(this.view, PALETTE.primary))
    } else {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.9, 4, 12), this.mat(TONE_HEX[marker.tone]))
      body.position.y = 0.85
      group.add(body)
    }
    if (marker.selected || marker.emphasized) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 8, 32), this.mat(PALETTE.primary))
      ring.rotation.x = Math.PI / 2
      ring.position.y = 0.05
      group.add(ring)
    }
    this.label(group, marker.label, new THREE.Vector3(0, 2.3, 0), marker.selected ? 'scene-label scene-label--selected' : 'scene-label')
    this.dynamic.add(group)
    this.markerPicks.push(group)
  }

  private addHighlight(nodeId: string, tone: 'primary' | 'warning'): void {
    const fp = footprintFor(nodeId)
    if (!fp) return
    const color = tone === 'warning' ? PALETTE.warning : PALETTE.primary
    const walls = this.boxBetween(fp, fp.floor, WALL_HEIGHT, PLATE_LIFT)
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(walls.size.x, walls.size.y, walls.size.z)), this.lineMat(color))
    outline.position.copy(walls.center)
    outline.userData = { floor: fp.floor }
    const tint = this.boxBetween(fp, fp.floor, 0.06, PLATE_LIFT + 0.04)
    const plate = new THREE.Mesh(new THREE.BoxGeometry(tint.size.x, tint.size.y, tint.size.z), this.mat(color, 0.12))
    plate.position.copy(tint.center)
    plate.userData = { floor: fp.floor }
    this.dynamic.add(outline, plate)
  }

  private addVeils(focus: FloorId): void {
    for (const floor of FLOOR_IDS) {
      if (floor === focus) continue
      const veil = this.boxBetween({ x0: SHELL.x0 - 1, y0: SHELL.y0 - 1, x1: SHELL.x1 + 1, y1: SHELL.y1 + 1 }, floor, 3, 0)
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(veil.size.x, veil.size.y, veil.size.z), this.mat(PALETTE.surface, 0.6))
      mesh.position.copy(veil.center)
      mesh.userData = { floor }
      this.dynamic.add(mesh)
    }
  }

  private applyFloorVisibility(): void {
    const filter = this.input?.floor ?? 'all'
    for (const [key, group] of this.floors) group.visible = key === 'site' ? filter === 'all' || filter === 'F1' : this.visible(key)
    for (const child of this.dynamic.children) {
      const floor = child.userData.floor as FloorId | undefined
      child.visible = floor ? this.visible(floor) : true
    }
    this.syncLabelVisibility(filter)
  }

  /** CSS2DRenderer only checks a label's own `visible`, not its ancestors', so mirror group visibility onto labels. */
  private syncLabelVisibility(filter: SceneInput['floor']): void {
    for (const group of this.floors.values()) {
      group.traverse((o) => {
        if (o instanceof CSS2DObject) o.visible = group.visible && (!this.roomLabels.includes(o) || filter !== 'all')
      })
    }
    for (const child of this.dynamic.children) {
      child.traverse((o) => {
        if (o instanceof CSS2DObject) o.visible = child.visible
      })
    }
  }

  private frameFloor(): void {
    const filter = this.input?.floor ?? 'all'
    const targetY = filter === 'all' ? 3 : floorY(filter) + 1
    this.controls.target.set(0, targetY, 0)
    this.camera.position.set(CAMERA_HOME.x * (filter === 'all' ? 1 : 0.7), targetY + (filter === 'all' ? 33 : 26), CAMERA_HOME.z * (filter === 'all' ? 1 : 0.7))
  }

  // ---------- interaction & loop ----------

  private readonly onPointerDown = (e: PointerEvent) => {
    this.downAt = { x: e.clientX, y: e.clientY }
  }

  private readonly onPointerUp = (e: PointerEvent) => {
    if (!this.downAt || Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > CLICK_SLOP_PX) return
    this.downAt = null
    const rect = this.renderer.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1)
    this.raycaster.setFromCamera(ndc, this.camera)
    const hit = (targets: THREE.Object3D[], key: string): string | null => {
      const visibleTargets = targets.filter((t) => t.visible)
      const [first] = this.raycaster.intersectObjects(visibleTargets, true)
      let node: THREE.Object3D | null = first?.object ?? null
      while (node && node.userData[key] === undefined) node = node.parent
      return (node?.userData[key] as string | undefined) ?? null
    }
    const entity = hit(this.markerPicks, 'entityId')
    if (entity) return this.callbacks.onPickEntity?.(entity)
    const hazard = hit(this.hazardPicks, 'hazardId')
    if (hazard) return this.callbacks.onPickHazard?.(hazard)
    if (this.input?.pickableNodes) {
      const nodeId = hit(this.plates.filter((p) => p.parent?.visible), 'nodeId')
      if (nodeId) this.callbacks.onPickNode?.(nodeId)
    }
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h)
    this.labels.setSize(w, h)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  private readonly animate = () => {
    this.frame = requestAnimationFrame(this.animate)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
    this.labels.render(this.scene, this.camera)
  }
}
```

`src/components/building3d/BuildingView3D.tsx`:
```tsx
import { Box } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'
import { BuildingScene } from './BuildingScene'
import type { SceneCallbacks, SceneInput } from './types'

export type BuildingView3DProps = SceneInput & SceneCallbacks & { className?: string }

/** React host for the three.js scene. Keep this prop contract when swapping in another building renderer. */
export function BuildingView3D({ className, onPickEntity, onPickNode, onPickHazard, ...input }: BuildingView3DProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<BuildingScene | null>(null)
  const callbacksRef = useRef<SceneCallbacks>({})
  const [failed, setFailed] = useState(false)
  callbacksRef.current = { onPickEntity, onPickNode, onPickHazard }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    try {
      sceneRef.current = new BuildingScene(host, {
        onPickEntity: (id) => callbacksRef.current.onPickEntity?.(id),
        onPickNode: (id) => callbacksRef.current.onPickNode?.(id),
        onPickHazard: (id) => callbacksRef.current.onPickHazard?.(id),
      })
    } catch (err) {
      console.error('3D building view unavailable', err)
      setFailed(true)
    }
    return () => {
      sceneRef.current?.dispose()
      sceneRef.current = null
    }
  }, [])

  const { markers, hazards, paths, risk, showFire, showSmoke, showRisk, floor, focusFloor, highlightNodeId, highlightTone, pickableNodes } = input
  useEffect(() => {
    sceneRef.current?.update({ markers, hazards, paths, risk, showFire, showSmoke, showRisk, floor, focusFloor, highlightNodeId, highlightTone, pickableNodes })
  }, [markers, hazards, paths, risk, showFire, showSmoke, showRisk, floor, focusFloor, highlightNodeId, highlightTone, pickableNodes])

  if (failed) {
    return (
      <div className={cn('flex h-full w-full items-start gap-2 rounded-8 bg-surface-container p-4 text-14 text-on-surface-variant', className)}>
        <Box size={20} strokeWidth={1.75} aria-hidden />
        The 3D building view needs WebGL, which this browser has turned off.
      </div>
    )
  }
  return <div ref={hostRef} role="img" aria-label="Jacobs Hall, floors B to 3" className={cn('relative h-full w-full overflow-hidden rounded-8', className)} />
}
```

- [ ] **Step 8: Verify**

Run: `npm test && npm run build`
Expected: tests PASS; `tsc` clean; Vite build succeeds (it bundles `demo/src/furnishings.js` and `demo/src/response-view.js` via the `@demo` alias; their bare `three` import resolves to the npm package). If `tsc` rejects a three.js addon import path, use `three/examples/jsm/...` instead and note it.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json src/components/building3d
git commit -m "feat: add three.js Jacobs Hall scene driven by engine coordinates"
```
(append the Co-Authored-By trailer)

---

### Task J9: Firefighter map

**Files:**
- Create: `src/components/map/MapToolbar.tsx`, `Swatch.tsx`, `OverlayToggles.tsx`, `FloorSelector.tsx`, `Legend.tsx`, `LastUpdated.tsx`, `MarkerCard.tsx`, `PriorityList.tsx`, `FirefighterMap.tsx`, `ResidentMap.tsx` (temporary body)
- Modify (replace): `src/components/map/MapPanel.tsx`

**Interfaces:**
- Consumes: `BuildingView3D`, `buildMarkers`, `buildHazards`, `buildPaths` (J8); store and selectors (J5); derive helpers (J4); labels; UI primitives (J6).
- Produces: `<FirefighterMap />`, `<MarkerCard />`, `<PriorityList className />`, `<Legend variant />`, `<OverlayToggles />`, `<FloorSelector />`, `<MapToolbar leading?>`, `<Swatch kind />` (`SwatchKind = 'fire' | 'smoke' | 'risk' | 'rescue' | 'evacuation' | 'resident'`), `<LastUpdated />`, `<MapPanel className />`, `humanizeCondition(code)`.

- [ ] **Step 1: Copy unchanged Phase 1 pieces**

Copy Phase 1 Task 10's `MapToolbar.tsx` verbatim. Copy Phase 1 Task 10's `LastUpdated.tsx` with `worldUpdatedAt` replaced by `updatedAt`. Copy Phase 1 Task 10's `ResidentMap.tsx` (temporary) verbatim. Copy Phase 1 Task 10's `MapPanel.tsx` verbatim.

- [ ] **Step 2: Swatch, toggles, floor selector, legend**

`src/components/map/Swatch.tsx`:
```tsx
import { cn } from '../../lib/cn'

export type SwatchKind = 'fire' | 'smoke' | 'risk' | 'rescue' | 'evacuation' | 'resident'

export function Swatch({ kind, muted }: { kind: SwatchKind; muted?: boolean }) {
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden className={cn('shrink-0', muted && 'opacity-40')}>
      {kind === 'fire' && <rect width="16" height="10" rx="2" className="fill-error" />}
      {kind === 'smoke' && <rect width="16" height="10" rx="2" className="fill-on-surface-variant" opacity={0.3} />}
      {kind === 'risk' && <rect width="16" height="10" rx="2" className="fill-error" opacity={0.25} />}
      {kind === 'rescue' && <line x1="1" y1="5" x2="15" y2="5" className="stroke-primary" strokeWidth={3} strokeLinecap="round" />}
      {kind === 'evacuation' && <line x1="1" y1="5" x2="15" y2="5" className="stroke-primary" strokeWidth={3} strokeDasharray="4 3" />}
      {kind === 'resident' && <line x1="1" y1="5" x2="15" y2="5" className="stroke-primary" strokeWidth={4} strokeDasharray="4 3" />}
    </svg>
  )
}
```

`src/components/map/OverlayToggles.tsx`: copy Phase 1 Task 10's file verbatim, replacing `ITEMS` with:
```tsx
const ITEMS: { kind: OverlayKind; label: string }[] = [
  { kind: 'fire', label: 'Fire' },
  { kind: 'smoke', label: 'Smoke' },
  { kind: 'risk', label: 'Spread risk' },
]
```

`src/components/map/FloorSelector.tsx`:
```tsx
import type { FloorFilter } from '../../types'
import { useSentinel } from '../../store'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'

const FLOORS: SegmentOption<FloorFilter>[] = [
  { value: 'all', label: 'All' },
  { value: 'F3', label: '3' },
  { value: 'F2', label: '2' },
  { value: 'F1', label: '1' },
  { value: 'B', label: 'B' },
]

export function FloorSelector() {
  const floor = useSentinel((s) => s.floor)
  const setFloor = useSentinel((s) => s.setFloor)
  return <SegmentedControl size="sm" layoutId="floor-filter" ariaLabel="Floor" options={FLOORS} value={floor} onChange={setFloor} />
}
```

`src/components/map/Legend.tsx`: copy Phase 1 Task 10's file, replacing `SWATCHES` with:
```tsx
const SWATCHES: Record<'firefighter' | 'resident', { kind: SwatchKind; label: string }[]> = {
  firefighter: [
    { kind: 'rescue', label: 'Rescue route' },
    { kind: 'evacuation', label: 'Evacuation route' },
    { kind: 'fire', label: 'Fire' },
    { kind: 'smoke', label: 'Smoke' },
    { kind: 'risk', label: 'Predicted spread' },
  ],
  resident: [
    { kind: 'resident', label: 'Your route' },
    { kind: 'fire', label: 'Fire' },
    { kind: 'smoke', label: 'Smoke' },
  ],
}
```

- [ ] **Step 3: Marker card and priority list**

`src/components/map/MarkerCard.tsx`:
```tsx
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
```

`src/components/map/PriorityList.tsx`:
```tsx
import { motion } from 'framer-motion'
import type { Entity, Recommendation } from '../../engine/types'
import { civilianStatus, civilianTone, peopleCount, placeLabel } from '../../engine/derive'
import { cn } from '../../lib/cn'
import { RESPONDER_LABEL, REVIEW_PRIORITY_LABEL } from '../../lib/labels'
import { STANDARD } from '../../lib/motion'
import { useSentinel } from '../../store'
import { useCivilians, useNodes } from '../../store/selectors'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'

type Row = { rank: number; civilian: Entity; rec: Recommendation }

function PriorityRow({ row, selected, onSelect, onHover }: { row: Row; selected: boolean; onSelect: (id: string) => void; onHover: (id: string | null) => void }) {
  const nodes = useNodes()
  const { civilian, rec } = row
  const evacuated = civilianStatus(civilian, nodes) === 'evacuated'
  return (
    <motion.li layout transition={STANDARD}>
      <button
        type="button"
        onClick={() => onSelect(civilian.entity_id)}
        onMouseEnter={() => onHover(civilian.entity_id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(civilian.entity_id)}
        onBlur={() => onHover(null)}
        aria-current={selected ? 'true' : undefined}
        className={cn('state-layer focus-ring relative flex w-full items-start gap-2 rounded-8 px-2 py-2 text-left', selected && 'bg-surface-container-high')}
      >
        {selected && <span aria-hidden className="absolute inset-y-2 left-0 w-0.5 bg-primary" />}
        <MonoText className="w-4 shrink-0 pt-0.5 text-12 text-on-surface-variant">{row.rank}</MonoText>
        <StatusDot tone={civilianTone(civilian, nodes)} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1">
            <span className="truncate text-14 font-semibold">{placeLabel(civilian, nodes)}</span>
            <MonoText className="text-12 text-on-surface-variant">· {peopleCount(civilian)}</MonoText>
          </div>
          <p className="line-clamp-2 text-12 text-on-surface-variant">{evacuated ? 'At staging' : rec.reason}</p>
        </div>
        {!evacuated && (
          <div className="shrink-0 text-right">
            <MonoText className="block text-12">{REVIEW_PRIORITY_LABEL[rec.priority]}</MonoText>
            <MonoText className="block text-12 text-on-surface-variant">
              {rec.nearest_responder_id ? RESPONDER_LABEL[rec.nearest_responder_id] ?? rec.nearest_responder_id : 'No route'}
            </MonoText>
          </div>
        )}
      </button>
    </motion.li>
  )
}

export function PriorityList({ className }: { className?: string }) {
  const recommendations = useSentinel((s) => s.recommendations)
  const selectedId = useSentinel((s) => s.selectedCivilianId)
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const hoverCivilian = useSentinel((s) => s.hoverCivilian)
  const civilians = useCivilians()
  const nodes = useNodes()

  const rows: Row[] = recommendations.flatMap((rec, i) => {
    const civilian = civilians.find((c) => c.entity_id === rec.civilian_id)
    return civilian ? [{ rank: i + 1, civilian, rec }] : []
  })
  const active = rows.filter((r) => civilianStatus(r.civilian, nodes) !== 'evacuated')
  const out = rows.filter((r) => civilianStatus(r.civilian, nodes) === 'evacuated')
  const render = (row: Row) => (
    <PriorityRow key={row.civilian.entity_id} row={row} selected={row.civilian.entity_id === selectedId} onSelect={selectCivilian} onHover={hoverCivilian} />
  )

  return (
    <aside aria-label="Rescue priority" className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex h-10 shrink-0 items-center justify-between px-4">
        <h3 className="text-12 font-medium text-on-surface-variant">Rescue priority</h3>
        <MonoText className="text-12 text-on-surface-variant">{active.length}</MonoText>
      </div>
      <ol className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {active.map(render)}
        {out.length > 0 && (
          <li role="presentation" className="px-2 pb-1 pt-4 text-12 font-medium text-on-surface-variant">
            Evacuated
          </li>
        )}
        {out.map(render)}
      </ol>
      <p className="shrink-0 border-t border-outline px-4 py-2 text-11 text-on-surface-variant">Engine proposals · command approval required</p>
    </aside>
  )
}
```

- [ ] **Step 4: Firefighter map**

`src/components/map/FirefighterMap.tsx`:
```tsx
import { useMemo } from 'react'
import { BuildingView3D } from '../building3d/BuildingView3D'
import { buildHazards, buildMarkers, buildPaths } from '../building3d/sceneData'
import { useSentinel } from '../../store'
import { useCivilians, useNodes, useResponders } from '../../store/selectors'
import { FloorSelector } from './FloorSelector'
import { LastUpdated } from './LastUpdated'
import { Legend } from './Legend'
import { MapToolbar } from './MapToolbar'
import { MarkerCard } from './MarkerCard'
import { OverlayToggles } from './OverlayToggles'
import { PriorityList } from './PriorityList'

const EMPTY_RISK: Record<string, number> = {}

export function FirefighterMap() {
  const snapshot = useSentinel((s) => s.snapshot)
  const graph = useSentinel((s) => s.graph)
  const prediction = useSentinel((s) => s.prediction)
  const evacuations = useSentinel((s) => s.evacuations)
  const overlays = useSentinel((s) => s.overlays)
  const floor = useSentinel((s) => s.floor)
  const selectedId = useSentinel((s) => s.selectedCivilianId)
  const hoveredId = useSentinel((s) => s.hoveredCivilianId)
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const civilians = useCivilians()
  const responders = useResponders()
  const nodes = useNodes()
  const focusId = hoveredId ?? selectedId

  const markers = useMemo(() => buildMarkers(civilians, responders, nodes, { selectedId, hoveredId }), [civilians, responders, nodes, selectedId, hoveredId])
  const hazards = useMemo(() => buildHazards(snapshot?.hazards ?? [], nodes, graph?.edges ?? []), [snapshot, nodes, graph])
  const paths = useMemo(() => buildPaths(snapshot?.routes ?? [], focusId ? evacuations[focusId] : null, focusId), [snapshot, evacuations, focusId])

  const onPickEntity = (id: string) => {
    if (civilians.some((c) => c.entity_id === id)) selectCivilian(id)
  }

  return (
    <>
      <MapToolbar leading={<FloorSelector />}>
        <OverlayToggles />
      </MapToolbar>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col p-4">
          <div className="relative min-h-0 flex-1">
            <BuildingView3D
              markers={markers}
              hazards={hazards}
              paths={paths}
              risk={prediction?.risk ?? EMPTY_RISK}
              showFire={overlays.fire}
              showSmoke={overlays.smoke}
              showRisk={overlays.risk}
              floor={floor}
              onPickEntity={onPickEntity}
            />
            <MarkerCard />
          </div>
          <div className="flex shrink-0 items-end justify-between gap-4 pt-2">
            <Legend variant="firefighter" />
            <LastUpdated />
          </div>
        </div>
        <PriorityList className="w-64 shrink-0 border-l border-outline" />
      </div>
    </>
  )
}
```

- [ ] **Step 5: Verify**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/map
git commit -m "feat: add firefighter 3D map with engine priorities and marker card"
```
(append the Co-Authored-By trailer). Browser check is done by the controller.

---

### Task J10: Sim mode on the engine

**Files:**
- Create: `src/components/map/SimControls.tsx`
- Modify: `src/components/map/FirefighterMap.tsx`

**Interfaces:**
- Consumes: store `simMode`, `setSimMode`, `simTool`, `setSimTool`, `moveSourceId`, `setMoveSource`, `addHazard`, `removeHazard`, `moveCivilian`, `pending`, `engineStatus`; `BuildingView3D` pick callbacks.
- Produces: `<SimControls />`; FirefighterMap wiring (Fire/Smoke/Blocked: click node; Remove: click hazard; Move: click civilian then node).

- [ ] **Step 1: Write SimControls**

`src/components/map/SimControls.tsx`:
```tsx
import { AnimatePresence, motion } from 'framer-motion'
import { Ban, Cloud, Eraser, Flame, FlaskConical, Move } from 'lucide-react'
import type { SimTool } from '../../types'
import { placeLabel } from '../../engine/derive'
import { fade } from '../../lib/motion'
import { useSentinel } from '../../store'
import { useCivilians, useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'

const TOOLS: SegmentOption<SimTool>[] = [
  { value: 'fire', label: 'Fire', icon: Flame },
  { value: 'smoke', label: 'Smoke', icon: Cloud },
  { value: 'blocked', label: 'Blocked', icon: Ban },
  { value: 'remove', label: 'Remove', icon: Eraser },
  { value: 'move', label: 'Move', icon: Move },
]

function useHint(): string {
  const tool = useSentinel((s) => s.simTool)
  const moveSourceId = useSentinel((s) => s.moveSourceId)
  const pending = useSentinel((s) => s.pending)
  const civilians = useCivilians()
  const nodes = useNodes()
  if (pending) return 'Updating the engine…'
  if (tool === 'remove') return 'Click a hazard to clear it.'
  if (tool === 'move') {
    const source = civilians.find((c) => c.entity_id === moveSourceId)
    return source ? `Click where ${placeLabel(source, nodes)} moved to.` : 'Click a civilian to move.'
  }
  return 'Click a room, corridor or stair.'
}

export function SimControls() {
  const simMode = useSentinel((s) => s.simMode)
  const setSimMode = useSentinel((s) => s.setSimMode)
  const tool = useSentinel((s) => s.simTool)
  const setTool = useSentinel((s) => s.setSimTool)
  const live = useSentinel((s) => s.engineStatus === 'live')
  const hint = useHint()

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={simMode ? 'tonal' : 'outline'}
        icon={FlaskConical}
        aria-pressed={simMode}
        disabled={!live}
        title={live ? undefined : 'Engine offline'}
        onClick={() => setSimMode(!simMode)}
      >
        Simulate
      </Button>
      <AnimatePresence initial={false}>
        {simMode && live && (
          <motion.div {...fade} className="flex items-center gap-2">
            <SegmentedControl size="sm" layoutId="sim-tool" ariaLabel="Simulation tool" options={TOOLS} value={tool} onChange={setTool} />
            <span className="hidden text-12 text-on-surface-variant 2xl:inline" role="status">{hint}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Wire the tools into FirefighterMap**

In `src/components/map/FirefighterMap.tsx`:
- Import `SimControls` from `./SimControls`.
- Add selectors:
```tsx
  const simMode = useSentinel((s) => s.simMode)
  const simTool = useSentinel((s) => s.simTool)
  const moveSourceId = useSentinel((s) => s.moveSourceId)
  const setMoveSource = useSentinel((s) => s.setMoveSource)
  const addHazard = useSentinel((s) => s.addHazard)
  const removeHazard = useSentinel((s) => s.removeHazard)
  const moveCivilian = useSentinel((s) => s.moveCivilian)
```
- Replace `onPickEntity` and add the other handlers:
```tsx
  const isCivilian = (id: string) => civilians.some((c) => c.entity_id === id)
  const onPickEntity = (id: string) => {
    if (!isCivilian(id)) return
    if (simMode && simTool === 'move') setMoveSource(id)
    else selectCivilian(id)
  }
  const onPickNode = (nodeId: string) => {
    if (!simMode) return
    if (simTool === 'fire' || simTool === 'smoke' || simTool === 'blocked') void addHazard(simTool, nodeId)
    else if (simTool === 'move' && moveSourceId) {
      void moveCivilian(moveSourceId, nodeId)
      setMoveSource(null)
    }
  }
  const onPickHazard = (hazardId: string) => {
    if (simMode && simTool === 'remove') void removeHazard(hazardId)
  }
  const pickableNodes = simMode && (simTool === 'fire' || simTool === 'smoke' || simTool === 'blocked' || (simTool === 'move' && moveSourceId !== null))
```
- Toolbar `leading` becomes:
```tsx
        leading={
          <div className="flex items-center gap-2">
            <FloorSelector />
            <SimControls />
          </div>
        }
```
- Pass to `BuildingView3D`: `onPickNode={onPickNode}`, `onPickHazard={onPickHazard}`, `pickableNodes={pickableNodes}`, and `highlightNodeId={simMode && simTool === 'move' && moveSourceId ? civilians.find((c) => c.entity_id === moveSourceId)?.graph_node_id ?? null : null}`.

- [ ] **Step 3: Verify**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/map
git commit -m "feat: add engine-backed sim mode for hazards and civilian moves"
```
(append the Co-Authored-By trailer)

---

### Task J11: Camera strip with simulated detection

**Files:**
- Create: `src/components/map/CameraTile.tsx`, `src/components/map/CameraStrip.tsx`
- Modify: `src/components/map/FirefighterMap.tsx`

**Interfaces:**
- Consumes: `CAMERAS`, `CameraSpec` (J3); store `expandedCameraId`, `setExpandedCamera`, `simulateDetection`, `engineStatus`, `pending`; `useNodes`.
- Produces: `<CameraStrip />`, `<CameraTile feed now expanded? compact? onClick className? />` where `feed: CameraSpec`.

- [ ] **Step 1: Copy and adapt Phase 1 Task 12**

Copy Phase 1 Task 12's `CameraTile.tsx` and `CameraStrip.tsx`, then apply:
1. In `CameraTile.tsx`, replace `import type { Camera } from '../../types'` with `import type { CameraSpec } from '../../data/scenarioThreads'` and the prop type `feed: Camera` with `feed: CameraSpec`.
2. In `CameraStrip.tsx`, replace `import { getCameraFeeds } from '../../lib/camera'` and `const feeds = getCameraFeeds()` with `import { CAMERAS } from '../../data/scenarioThreads'` and `const feeds = CAMERAS`.
3. In `CameraStrip.tsx`, when a camera is expanded, render this row directly under the header row (before the grid):
```tsx
      {main && (
        <div className="mb-2 flex items-center gap-2 text-12 text-on-surface-variant">
          <MonoText>{main.nodeId}</MonoText>
          <span>· {nodes.get(main.nodeId)?.label ?? 'Unknown node'}</span>
          <span className="flex-1" />
          <Button
            size="sm"
            icon={ScanSearch}
            disabled={!live || pending || main.status !== 'live'}
            title={live ? undefined : 'Engine offline'}
            onClick={() => void simulateDetection(main)}
          >
            Simulate smoke detection
          </Button>
        </div>
      )}
```
with these additions at the top of `CameraStrip`:
```tsx
import { ScanSearch } from 'lucide-react'
import { useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
```
```tsx
  const nodes = useNodes()
  const live = useSentinel((s) => s.engineStatus === 'live')
  const pending = useSentinel((s) => s.pending)
  const simulateDetection = useSentinel((s) => s.simulateDetection)
```
4. Mount `<CameraStrip />` in `FirefighterMap.tsx` exactly as Phase 1 Task 12 Step 3 describes (after the closing `</div>` of the map row, before `</>`).

- [ ] **Step 2: Verify and commit**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

```bash
git add src/components/map
git commit -m "feat: add camera strip with simulated detections into the engine"
```
(append the Co-Authored-By trailer)

---

### Task J12: Resident map and AR preview

**Files:**
- Create: `src/components/map/InstructionCard.tsx`, `src/components/map/ARView.tsx`
- Modify (replace): `src/components/map/ResidentMap.tsx`

**Interfaces:**
- Consumes: derive (`instructionsFor`, `instructionMode`, `placeLabel`, `floorOf`, `peopleCount`), `effectiveEvacuation`, `BuildingView3D`, `buildHazards`, store (`viewingAsId`, `evacuations`, `advisories`, `devGoStay`, `residentView`, `setResidentView`, `overlays`, `prediction`, `updatedAt`).
- Produces: `<InstructionCard mode instructions updatedAt />`, `<ARView civilian route instructions />`, `<ResidentMap />`.

- [ ] **Step 1: InstructionCard**

Copy Phase 1 Task 13's `InstructionCard.tsx` verbatim.

- [ ] **Step 2: AR preview**

`src/components/map/ARView.tsx`:
```tsx
/** PLACEHOLDER first-person preview driven by the engine's route steps. Replace with the real AR view; keep these props. */
import { CircleCheck, Navigation, ShieldAlert } from 'lucide-react'
import type { Instruction } from '../../types'
import { instructionMode, placeLabel } from '../../engine/derive'
import type { Entity, Route } from '../../engine/types'
import { useNodes } from '../../store/selectors'
import { Emphasis } from '../ui/Emphasis'
import { MonoText } from '../ui/MonoText'

type Props = { civilian: Entity; route: Route | null; instructions: Instruction[] }

const EDGE = { className: 'stroke-outline', strokeWidth: 1.5 }
const CHEVRONS = [
  { y: 420, scale: 1 },
  { y: 355, scale: 0.72 },
  { y: 305, scale: 0.5 },
]

function Corridor() {
  return (
    <g>
      <polygon points="0,0 800,0 470,190 330,190" className="fill-surface" />
      <polygon points="0,450 800,450 470,250 330,250" className="fill-surface-container" />
      <polygon points="0,0 330,190 330,250 0,450" className="fill-surface-container-high" />
      <polygon points="800,0 470,190 470,250 800,450" className="fill-surface-container-high" />
      <rect x="330" y="190" width="140" height="60" className="fill-surface" {...EDGE} />
      <line x1="0" y1="0" x2="330" y2="190" {...EDGE} />
      <line x1="800" y1="0" x2="470" y2="190" {...EDGE} />
      <line x1="0" y1="450" x2="330" y2="250" {...EDGE} />
      <line x1="800" y1="450" x2="470" y2="250" {...EDGE} />
    </g>
  )
}

export function ARView({ civilian, route, instructions }: Props) {
  const nodes = useNodes()
  const mode = instructionMode(civilian, route, nodes)
  const steps = mode === 'go' && route ? route.steps : []
  const [current, ...upcoming] = steps
  const headline = current?.instruction ?? instructions[0]?.text ?? ''

  return (
    <div className="relative h-full overflow-hidden rounded-12 border border-outline bg-surface-container-high">
      <svg viewBox="0 0 800 450" preserveAspectRatio="xMidYMid slice" className="h-full w-full" aria-hidden>
        <Corridor />
        {current && (
          <g fill="none" className="stroke-primary" strokeLinecap="round" strokeLinejoin="round">
            {CHEVRONS.map((c) => (
              <path key={c.y} d="M-44 14 L0 -14 L44 14" strokeWidth={12} transform={`translate(400 ${c.y}) scale(${c.scale})`} />
            ))}
          </g>
        )}
      </svg>

      <div className="absolute left-3 top-3 rounded-8 border border-outline bg-surface px-3 py-2">
        <MonoText className="block text-12 font-medium">{civilian.entity_id}</MonoText>
        <span className="text-11 text-on-surface-variant">{placeLabel(civilian, nodes)} · AR preview</span>
      </div>

      {current && (
        <div className="absolute right-3 top-3 flex items-center gap-3 rounded-8 border border-outline bg-surface px-3 py-2">
          <Navigation size={20} strokeWidth={1.75} className="text-primary" style={{ transform: `rotate(${current.bearing_degrees}deg)` }} aria-label={`Heading ${Math.round(current.bearing_degrees)} degrees`} />
          <div className="text-right">
            <MonoText className="block text-18 font-semibold">{Math.round(current.distance_m)} m</MonoText>
            <MonoText className="text-11 text-on-surface-variant">{Math.round(current.bearing_degrees)}°</MonoText>
          </div>
        </div>
      )}

      {mode === 'stay' && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div className="flex items-center gap-2 rounded-8 border border-warning/40 bg-surface px-4 py-3 text-14 font-semibold text-warning">
            <ShieldAlert size={20} strokeWidth={1.75} aria-hidden />
            Stay in place
          </div>
        </div>
      )}
      {mode === 'out' && (
        <div className="absolute inset-x-0 top-1/3 flex justify-center">
          <div className="flex items-center gap-2 rounded-8 border border-success/40 bg-surface px-4 py-3 text-14 font-semibold text-success">
            <CircleCheck size={20} strokeWidth={1.75} aria-hidden />
            You are out
          </div>
        </div>
      )}

      <div className="absolute inset-x-3 bottom-3 rounded-8 border border-outline bg-surface px-3 py-2">
        <p className="text-14 font-medium">
          <Emphasis text={headline} strongClassName="text-primary" />
        </p>
        {upcoming.length > 0 && (
          <ol className="mt-1 space-y-0.5 text-12 text-on-surface-variant">
            {upcoming.slice(0, 2).map((s) => (
              <li key={`${s.to_node}-${s.instruction}`}>Then {s.instruction.charAt(0).toLowerCase() + s.instruction.slice(1)}</li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Resident map**

`src/components/map/ResidentMap.tsx`:
```tsx
import { AnimatePresence, motion } from 'framer-motion'
import { Building2, ScanEye } from 'lucide-react'
import { useMemo } from 'react'
import type { ResidentView } from '../../types'
import { floorOf, instructionMode, instructionsFor, peopleCount, placeLabel } from '../../engine/derive'
import { fade } from '../../lib/motion'
import { useSentinel } from '../../store'
import { effectiveEvacuation, useCivilians, useNodes } from '../../store/selectors'
import { BuildingView3D } from '../building3d/BuildingView3D'
import { buildHazards, shortLabel } from '../building3d/sceneData'
import type { SceneMarker, ScenePath } from '../building3d/types'
import { SegmentedControl, type SegmentOption } from '../ui/SegmentedControl'
import { ARView } from './ARView'
import { InstructionCard } from './InstructionCard'
import { LastUpdated } from './LastUpdated'
import { Legend } from './Legend'
import { MapToolbar } from './MapToolbar'
import { OverlayToggles } from './OverlayToggles'

const VIEWS: SegmentOption<ResidentView>[] = [
  { value: 'building', label: 'Building', icon: Building2 },
  { value: 'ar', label: 'AR', icon: ScanEye },
]
const EMPTY_RISK: Record<string, number> = {}

export function ResidentMap() {
  const snapshot = useSentinel((s) => s.snapshot)
  const graph = useSentinel((s) => s.graph)
  const prediction = useSentinel((s) => s.prediction)
  const evacuations = useSentinel((s) => s.evacuations)
  const advisories = useSentinel((s) => s.advisories)
  const overlays = useSentinel((s) => s.overlays)
  const viewingAsId = useSentinel((s) => s.viewingAsId)
  const residentView = useSentinel((s) => s.residentView)
  const setResidentView = useSentinel((s) => s.setResidentView)
  const devGoStay = useSentinel((s) => s.devGoStay)
  const updatedAt = useSentinel((s) => s.updatedAt)
  const civilians = useCivilians()
  const nodes = useNodes()
  const civilian = civilians.find((c) => c.entity_id === viewingAsId) ?? civilians[0]

  const hazards = useMemo(() => buildHazards(snapshot?.hazards ?? [], nodes, graph?.edges ?? []), [snapshot, nodes, graph])
  const evacuation = civilian ? effectiveEvacuation(evacuations[civilian.entity_id], devGoStay) : null
  const mode = civilian ? instructionMode(civilian, evacuation, nodes) : 'stay'
  const instructions = civilian ? instructionsFor(civilian, evacuation, snapshot?.hazards ?? [], nodes) : []
  const advisory = civilian ? advisories[civilian.entity_id] : undefined
  const floor = civilian ? floorOf(civilian, nodes) : null

  const markers = useMemo<SceneMarker[]>(() => {
    const node = civilian?.graph_node_id ? nodes.get(civilian.graph_node_id) : undefined
    if (!civilian || !node) return []
    return [{ id: civilian.entity_id, kind: 'civilian', floor: node.floor_id, x: node.x, y: node.y, label: `You · ${shortLabel(placeLabel(civilian, nodes))}`, tone: 'safe', selected: true }]
  }, [civilian, nodes])
  const paths = useMemo<ScenePath[]>(
    () => (mode === 'go' && evacuation && evacuation.polyline.length > 1 ? [{ id: evacuation.route_id, points: evacuation.polyline, variant: 'evacuation', emphasized: true }] : []),
    [mode, evacuation],
  )

  if (!civilian) return <div className="p-4 text-14 text-on-surface-variant">No resident to show.</div>

  return (
    <>
      <MapToolbar
        leading={
          <div className="flex items-center gap-2">
            <SegmentedControl size="sm" layoutId="resident-view" ariaLabel="Resident view" options={VIEWS} value={residentView} onChange={setResidentView} />
            <span className="hidden text-12 text-on-surface-variant lg:inline">
              {placeLabel(civilian, nodes)} · {peopleCount(civilian)} {peopleCount(civilian) === 1 ? 'person' : 'people'}
            </span>
          </div>
        }
      >
        <OverlayToggles />
      </MapToolbar>
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
        <InstructionCard mode={mode} instructions={instructions} updatedAt={updatedAt} />
        {advisory && (
          <details className="-mt-2 shrink-0 text-12 text-on-surface-variant">
            <summary className="focus-ring cursor-pointer rounded-8">Full advisory · pending command approval</summary>
            <p className="mt-1 text-14 text-on-surface">{advisory.message}</p>
          </details>
        )}
        <div className="relative min-h-0 flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={residentView} {...fade} className="absolute inset-0">
              {residentView === 'building' ? (
                <BuildingView3D
                  markers={markers}
                  hazards={hazards}
                  paths={paths}
                  risk={prediction?.risk ?? EMPTY_RISK}
                  showFire={overlays.fire}
                  showSmoke={overlays.smoke}
                  showRisk={overlays.risk}
                  floor="all"
                  focusFloor={floor}
                  highlightNodeId={civilian.graph_node_id}
                  highlightTone={mode === 'stay' ? 'warning' : 'primary'}
                />
              ) : (
                <ARView civilian={civilian} route={evacuation} instructions={instructions} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex shrink-0 items-end justify-between gap-4">
          <Legend variant="resident" />
          <LastUpdated />
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

```bash
git add src/components/map
git commit -m "feat: add resident instructions, evacuation route view and AR preview"
```
(append the Co-Authored-By trailer)

---

### Task J13: Firefighter communication panel

**Files:** Phase 1 Task 14's files (`src/components/comms/MessageRow.tsx`, `MessageList.tsx`, `Composer.tsx`, `ThreadHeader.tsx`, `ThreadList.tsx`, `ThreadView.tsx`, `FirefighterComms.tsx`, temporary `ResidentComms.tsx`, and replacing `CommsPanel.tsx`).

**Interfaces:**
- Consumes: store (`threads`, `selectedThreadId`, `selectThread`, `selectCivilian`, `sendMessage`, `clearThread`, `markRead`, `composerFocusNonce`, `recommendations`), `useEntity`, `useNodes`, `useThread`, derive helpers, labels.
- Produces: the same components as Phase 1 Task 14, keyed to engine civilians.

- [ ] **Step 1: Copy Phase 1 Task 14 verbatim, then apply these changes**

1. `MessageRow.tsx`, `MessageList.tsx`, `Composer.tsx`, `FirefighterComms.tsx`, `ResidentComms.tsx` (temporary) and `CommsPanel.tsx`: no changes.

2. `ThreadHeader.tsx`: replace the `Person` type with `Entity` and render engine fields:
```tsx
import { Crosshair, Radio } from 'lucide-react'
import type { Thread } from '../../types'
import { CIVILIAN_STATUS_LABEL, civilianStatus, civilianTone, peopleCount, placeLabel } from '../../engine/derive'
import type { Entity } from '../../engine/types'
import { formatCoords } from '../../lib/format'
import { useSentinel } from '../../store'
import { useNodes } from '../../store/selectors'
import { Button } from '../ui/Button'
import { InlineConfirm } from '../ui/InlineConfirm'
import { MonoText } from '../ui/MonoText'
import { StatusChip } from '../ui/StatusChip'
import { StatusDot } from '../ui/StatusDot'
import { STATUS_TONE } from '../ui/tone'
import { humanizeCondition } from '../map/MarkerCard'

type Props = { thread: Thread; civilian?: Entity; onClear: () => void }

export function ThreadHeader({ thread, civilian, onClear }: Props) {
  const selectCivilian = useSentinel((s) => s.selectCivilian)
  const nodes = useNodes()
  const clear = <InlineConfirm label="Clear" prompt="Clear for everyone?" confirmLabel="Clear" onConfirm={onClear} />

  if (!civilian) {
    return (
      <header className="flex shrink-0 items-center gap-2 border-b border-outline px-4 py-3">
        <Radio size={20} strokeWidth={1.75} className="text-on-surface-variant" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-16 font-semibold tracking-tightest">Crew</h2>
          <MonoText className="text-12 text-on-surface-variant">E7 · L3 · BC2 · Alpha · Bravo</MonoText>
        </div>
        {thread.messages.length > 0 && clear}
      </header>
    )
  }

  const status = civilianStatus(civilian, nodes)
  const count = peopleCount(civilian)
  return (
    <header className="shrink-0 border-b border-outline px-4 py-3">
      <div className="flex items-center gap-2">
        <StatusDot tone={civilianTone(civilian, nodes)} />
        <span className="truncate text-16 font-semibold tracking-tightest">{placeLabel(civilian, nodes)}</span>
        <span className="shrink-0 text-14 text-on-surface-variant">
          {count} {count === 1 ? 'person' : 'people'}
        </span>
        <StatusChip tone={STATUS_TONE[status]} label={CIVILIAN_STATUS_LABEL[status]} />
        <span className="flex-1" />
        <Button variant="ghost" size="sm" icon={Crosshair} onClick={() => selectCivilian(civilian.entity_id)}>
          Locate
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <MonoText className="text-12 text-on-surface-variant">{civilian.world_position ? formatCoords(civilian.world_position) : civilian.entity_id}</MonoText>
        {(civilian.priority?.reported_conditions ?? []).map((c) => (
          <span key={c} className="rounded-8 bg-surface-container-high px-2 py-0.5 text-12">
            {humanizeCondition(c)}
          </span>
        ))}
        <span className="flex-1" />
        {thread.messages.length > 0 && clear}
      </div>
    </header>
  )
}
```

3. `ThreadList.tsx`: rows are labeled by place and ordered by engine rank. Replace the `Person` import/type with `Entity`, and:
   - selectors: `const civilians = useCivilians()`, `const nodes = useNodes()`, `const recommendations = useSentinel((s) => s.recommendations)`, removing `people` and `useDerived`
   - rank map: `const rankOf = new Map(recommendations.map((r, i) => [r.civilian_id, i + 1]))`
   - resident row: `civilian={civilians.find((c) => c.entity_id === t.personId)}`
   - in `ThreadRow`, the prop is `civilian?: Entity`; the dot is `<StatusDot tone={civilianTone(civilian, nodes)} />` (`const nodes = useNodes()` inside `ThreadRow`), and the title is `civilian ? shortLabel(placeLabel(civilian, nodes)) : 'Crew'` (import `shortLabel` from `../building3d/sceneData`), keeping the `font-mono` class only for civilian rows.

4. `ThreadView.tsx`: replace `usePerson(thread?.personId ?? null)` with `useEntity(thread?.personId ?? null)`, rename `person` to `civilian`, pass `civilian={civilian}` to `ThreadHeader`, and the composer placeholder becomes `civilian ? \`Message ${placeLabel(civilian, nodes)}\` : 'Message crew'` (with `const nodes = useNodes()` and imports from `../../engine/derive` and `../../store/selectors`).

5. Commit message: `feat: add firefighter thread list, thread view and composer`.

- [ ] **Step 2: Verify**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

---

### Task J14: Resident communication panel

**Files:** `src/components/comms/QuickReplies.tsx`, replace `src/components/comms/ResidentComms.tsx`.

**Interfaces:**
- Consumes: store (`viewingAsId`, `sendMessage`, `sendQuickReply`, `clearThread`, `pending`), `useEntity`, `useThread`, `useNodes`, `threadIdFor`, derive helpers.
- Produces: `<QuickReplies current onReply />` where `current: CivilianStatus`; `<ResidentComms />`.

- [ ] **Step 1: Copy Phase 1 Task 15, then apply these changes**

1. `QuickReplies.tsx`: replace `import type { QuickReply, Status } from '../../types'` with:
```tsx
import type { QuickReply } from '../../types'
import type { CivilianStatus } from '../../engine/derive'
```
   Then change every `Status` type reference to `CivilianStatus` (the `status` values `'evacuated' | 'trapped' | 'immobile'` already match).

2. `ResidentComms.tsx`: replace with
```tsx
import { threadIdFor } from '../../data/scenarioThreads'
import { civilianStatus, placeLabel } from '../../engine/derive'
import { useSentinel } from '../../store'
import { useEntity, useNodes, useThread } from '../../store/selectors'
import { InlineConfirm } from '../ui/InlineConfirm'
import { MonoText } from '../ui/MonoText'
import { StatusDot } from '../ui/StatusDot'
import { Composer } from './Composer'
import { MessageList } from './MessageList'
import { QuickReplies } from './QuickReplies'

export function ResidentComms() {
  const viewingAsId = useSentinel((s) => s.viewingAsId)
  const live = useSentinel((s) => s.engineStatus === 'live')
  const sendMessage = useSentinel((s) => s.sendMessage)
  const sendQuickReply = useSentinel((s) => s.sendQuickReply)
  const clearThread = useSentinel((s) => s.clearThread)
  const civilian = useEntity(viewingAsId)
  const thread = useThread(threadIdFor(viewingAsId))
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
```

3. Commit message: `feat: add resident thread with one-tap replies reported to the engine`.

- [ ] **Step 2: Verify**

Run: `npm test && npm run build`
Expected: PASS; build succeeds.

---

### Task J15: README and final verification

**Files:**
- Create/replace: `README.md`

**Interfaces:**
- Consumes: the whole app and engine.
- Produces: a verified, documented demo.

- [ ] **Step 1: Write the README**

`README.md`:
````markdown
# Sentinel

Fire emergency routing and communication for UC Berkeley's Jacobs Hall. One shared incident, two perspectives: Firefighter and Resident. The React app is the frontend for `sentinel_engine`, which owns the building graph, hazards, routes, fire-spread prediction, triage and advisories.

## Run

```bash
npm install
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # once, for the engine
npm run demo        # engine on :8787 + app
```

`npm run dev` starts only the app. Without the engine it shows a recorded incident with an "Engine offline" banner and retries every 5 seconds. `npm run engine` starts only the engine. Set `VITE_ENGINE_URL` to point the app elsewhere.

Tests: `npm test` (app), `npm run engine:test` (engine), `npm run build` (type-check and build).

## Demo script

1. Firefighter: the rescue priority list comes from the engine's triage. Hover a row to trace its routes in 3D; click a civilian for details and **Assign Alpha/Bravo**.
2. Floors: All, 3, 2, 1, B isolate a floor. Overlays toggle fire, smoke and predicted spread.
3. Resident (or **View as resident** from a marker card): instructions, the evacuation route, and an AR preview from the engine's route steps.
4. Tap **I'm trapped** as a resident, then switch to Firefighter: the engine re-triages and the marker, list and thread update.
5. Firefighter → **Simulate**: add fire, smoke or blocked hazards on any room or corridor, remove hazards, or move a civilian. Routes recompute in the engine.
6. Cameras: expand a feed and **Simulate smoke detection** to send an observation through the same API a real CV system would use.

Demo controls (sliders icon, top right): resident to view as, Go/Stay override, Reset demo (reseeds the engine).

## Architecture

| Piece | Where |
|---|---|
| Engine API client and types | `src/engine/` |
| Seed scenario, threads, cameras | `src/data/scenario.json`, `src/data/scenarioThreads.ts` |
| 3D layout (footprints, furnishings) in engine meters | `src/data/jacobsLayout.ts` |
| three.js scene | `src/components/building3d/` (reuses `demo/src` furniture and firefighter builders) |
| Store (engine sync, threads, UI) | `src/store/` |
| Offline recording | `src/data/engine-snapshot.json`, regenerate with `PYTHONPATH=. .venv/bin/python scripts/capture_engine_snapshot.py` |

The engine's coordinates (`JACOBS_LOCAL`) and room layout are illustrative, as documented in `sentinel_engine/INTEGRATION.md`. Routes and advisories are decision-support proposals that require command approval.
````

- [ ] **Step 2: Full automated checks**

Run: `npm test && npm run build && npm run engine:test`
Expected: all app tests pass; build succeeds; 65 engine tests pass.

- [ ] **Step 3: Design guardrails**

Run:
```bash
grep -rnE "#[0-9A-Fa-f]{6}" src --include=*.ts --include=*.tsx
grep -rn "shadow-float" src
grep -rnE "font-bold|text-(xs|sm|base|lg|xl)|rounded-(sm|md|lg|xl)|gradient|backdrop-blur|purple" src
git diff --stat origin/main -- demo/
```
Expected: the first command prints nothing (3D colors are `0x` literals, only in `palette.ts`); `shadow-float` appears only in `MarkerCard.tsx` and `DevMenu.tsx`; the third command prints nothing; the last prints nothing (`demo/` unchanged versus the teammate's branch).

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document Sentinel engine integration and demo script"
```
(append the Co-Authored-By trailer). The full browser walkthrough is done by the controller.
