# Sentinel Intelligence Engine — Design Spec

**Date:** 2026-10-17
**Status:** Approved design, pre-implementation
**Owner:** Intelligence engine workstream (ML, spatial reasoning, routing, triage)

## 1. Summary

Sentinel is an AI-assisted emergency-response platform for a hackathon demo. This
spec covers the **intelligence backend**: a self-contained Python package
(`sentinel_engine/`) that maintains a spatial model of UC Berkeley's Jacobs Hall,
fuses distributed observations into one shared incident state, predicts fire
spread, computes hazard-aware optimal routes, triages civilian distress reports,
and drafts civilian advisory messages — all exposed through a FastAPI service for
a separately developed frontend.

The frontend (built by another developer) has two views that consume this engine:

- **AR view (firefighter, first-person):** consumes per-responder turn-by-turn
  guidance anchored in world coordinates.
- **Building view (whole-building 3D):** consumes floor geometry, entity markers,
  hazard markers, route polylines, and the fire-spread risk field as a heat
  overlay.

This is a research/demo prototype, not a certified emergency system. All model
outputs are decision-support proposals: routes are `candidate` status with
`requires_command_approval: true`, advisories are drafts for the incident
commander, and triage output is a dispatch *review* priority, not medical triage.

## 2. Scope decisions (approved)

| Decision | Choice |
|---|---|
| Computer vision | **Descoped.** No YOLO/torch/OpenCV. A simulated perception feed emits observations already in building coordinates, tagged `simulated`, through the same API a real CV system would use later. |
| Camera calibration / homography | Descoped with CV. The abstraction boundary is the `POST /observations` contract. |
| Building data | Brief research (official Jacobs Institute spaces page, OpenStreetMap) for floor count, real room names, stair/entrance structure; **illustrative coordinates/geometry**, everything tagged `simulated`. |
| Frontend updates | Polling: full state at `GET /incident/state`, deltas at `GET /incident/events?since=<seq>`. No WebSocket. |
| Distress parsing | Deterministic rules (keywords/patterns). No LLM dependency. |
| Routing algorithm | Hand-rolled Dijkstra. No networkx. |
| Fire-spread ML | **Included:** graph-based stochastic spread simulator + scikit-learn surrogate model trained on synthetic rollouts. Built after the deterministic core works; Monte Carlo backend is the fallback. |
| Environment | `venv` + `requirements.txt`. Dependencies: fastapi, uvicorn, pydantic, scikit-learn, joblib, pytest, httpx (tests). |

## 3. Architecture

Layered package; domain modules are pure Python with no web imports. FastAPI is
a thin adapter.

```
sentinel_engine/
  data/jacobs_hall.json       # illustrative building model (floors, rooms, graph)
  data/spread_model.joblib    # trained surrogate checkpoint (committed, small)
  building.py                 # model load/validate; coordinate frame; name→node resolution
  routing.py                  # Dijkstra, hazard-aware costs, alternates, polylines, guidance steps
  spread.py                   # fire-spread simulator, Monte Carlo + surrogate predictors
  train_spread_model.py       # generates rollouts, trains surrogate, reports validation AUC
  perception.py               # simulated perception feed (scripted scenario observations)
  triage.py                   # rule-based distress extraction + priority engine
  advisories.py               # per-civilian advisory text composition
  state.py                    # in-memory IncidentState: entities, hazards, routes, event log
  api.py                      # FastAPI app + Pydantic schemas
  demo.py                     # reproducible end-to-end scenario
  tests/                      # pytest per module + HTTP integration test
  INTEGRATION.md              # handoff guide for the frontend developer
```

## 4. Coordinate system

- Frame id: `JACOBS_LOCAL`. Local meters, not lat/long.
- Origin: building's southwest ground-floor corner (illustrative). `x` east,
  `y` north, `z` elevation above origin.
- Every position: `{x, y, z, floor_id}`. Floors: `B` (z=-4.0), `F1` (0.0),
  `F2` (4.0), `F3` (8.0) — illustrative elevations, documented in one place.
- Each floor exposes its `(x, y)` plane directly for 2D rendering; the 3D
  building view uses `(x, y, z)` as-is.
- `GET /spatial/coordinate-system` returns this contract so the frontend never
  guesses.

Every entity, observation, hazard, and route point carries `floor_id`,
`coordinate_frame`, `source`, `position_status`
(`reported | simulated | estimated | unknown`), and `timestamp`.

## 5. Building model (`building.py`, `data/jacobs_hall.json`)

- Illustrative Jacobs Hall: basement + 3 floors, real room names where public
  sources confirm them (e.g. studios, makerspace labs), invented-but-labeled
  otherwise. Every floor/room/edge tagged `"provenance": "simulated"` with a
  `source_note`.
- Graph nodes: rooms, corridor junctions, stairwell landings, entrances/exits,
  staging areas. Nodes carry world coords and `node_type`.
- Edges: traversable connections with base distance (m) and `edge_type`
  (`corridor | doorway | stairs | exterior_door`). Stairwell landings on
  adjacent floors are the **only** inter-floor edges. Elevator exists in the
  model but is excluded from routing by default (fire procedure).
- At least 2 stairwells and 2 entrances so alternate routes always exist.
- Name resolution: "Studio 210", "second floor", "east stairwell" → node id.
  Room-number leading digit cross-checked against the stated floor; conflicts
  are flagged, not silently resolved.

## 6. Incident state & data fusion (`state.py`)

All inputs funnel into one in-memory `IncidentState`:

```
simulated perception feed ─┐
civilian text reports ─────┤→ IncidentState ──→ triage priorities
firefighter reports ───────┤   (entities, hazards,   candidate routes
manual dispatcher input ───┘    event log seq#)      guidance, advisories
```

- **Entities** (civilian, responder, detected_person): last known
  `world_position`, snapped `graph_node_id` (original position retained),
  `position_status`, `source`, `last_updated`. Detected persons are never
  auto-merged with reported civilians — association only via explicit human
  input. No identity inference, no facial recognition.
- **Hazards** (fire, smoke, blocked): attach to nodes or edges, carry
  `verified` flag and provenance. Mutations adjust edge costs or exclude
  edges, invalidate and recompute affected routes, and append events.
- **Event log:** every mutation appends `{seq, timestamp, type, payload}`.
  Monotonic `seq` drives frontend polling.
- A person with unknown location stays in state flagged
  `location unresolved — needs contact`; unknown never deprioritizes.

## 7. Routing & guidance (`routing.py`)

Cost function (weights in one configurable dict):

```
cost(edge) = distance × (1 + smoke_penalty + hazard_penalty
                           + uncertainty_penalty + λ·predicted_fire_risk)
```

- Confirmed blocked or burning edges: excluded entirely.
- Smoke: traversable but heavily penalized (default ×5 multiplier).
- Unverified hazards: moderate penalty, named in `hazards_considered` and
  `assumptions`.
- `predicted_fire_risk`: per-node ignition probability from the spread
  predictor (Section 8), so routes bend around where fire is *going*.

Primary route via Dijkstra; one alternate via re-running with the primary's
edges penalized. Unreachable targets return `status: "unreachable"` with the
blocking hazards named. Route responses always distinguish shortest *distance*
from lowest *cost*, and are never labeled "safe".

Route response contains:

- `nodes`: ordered node ids.
- `polyline`: ordered `{x, y, z, floor_id}` points — frontend draws it with
  zero geometric work (3D building view).
- `steps`: turn-by-turn segments: instruction text ("ahead 12 m along
  corridor", "stairs up to Floor 2"), next-waypoint world coords (AR anchor),
  distance, bearing (degrees from +y/north of the local frame).
- `total_distance_m`, `total_cost`, `hazards_considered`, `assumptions`,
  `status: "candidate"`, `requires_command_approval: true`.

**AR guidance:** `GET /responders/{id}/guidance` snaps the responder's last
known position to their active route and returns the current/next steps. After
a reroute the endpoint serves the new path on the next poll — the AR view needs
no special reroute handling.

**Hazard-triggered recalculation:** any hazard add/update/remove recomputes all
active routes; changed routes emit `route_updated` events. This is the "east
stairwell is blocked" demo beat.

## 8. Fire-spread prediction (`spread.py`, `train_spread_model.py`)

**Simulator.** Discrete-time stochastic process on the building graph. Node
state: `unburned | burning | burned`. Each tick (30 simulated seconds), fire
spreads across each edge from a burning node with
`p = base_rate × edge_openness ÷ distance_factor`; `edge_openness` by edge
type: open corridor > doorway > fire-rated stairwell door > inter-floor shaft.
Smoke propagates one step ahead of fire, faster. All outputs labeled
`simulated` — plausible dynamics, not real fire physics.

**Predictor interface.** `predict_spread(fire_nodes, horizon_minutes)` →
per-node ignition probability. Two interchangeable backends:

- `MonteCarloPredictor`: ~500 rollouts, ignition frequency per node. Always
  available; demo ground truth.
- `SurrogatePredictor`: scikit-learn gradient-boosted classifier trained on
  ~5k rollouts. Per-node features: graph distance to nearest fire, count of
  independent paths to fire, same-floor flag, min edge-openness along nearest
  path, smoke state. One fast pass instead of 500 rollouts. Trained by
  `train_spread_model.py`; small `.joblib` checkpoint committed; held-out AUC
  vs. Monte Carlo labels reported honestly in INTEGRATION.md.

The surrogate is a **learned surrogate of our own simulator** and is presented
as exactly that. If training underperforms or time runs out, the Monte Carlo
backend ships and the surrogate is reported as not completed — never claimed.

**Exposure:** risk field feeds the routing cost term and is served at
`GET /spread/prediction` for the building view's heat overlay.
`POST /spread/ignite` is a demo control to place/advance fire.

## 9. Perception feed (`perception.py`)

Stands in for the descoped CV layer. Scripted scenario observations:

```json
{
  "observation_id": "OBS_001",
  "type": "person",
  "world_position": {"x": 11.8, "y": 7.2, "z": 4.0, "floor_id": "F2"},
  "source": "simulated_camera",
  "camera_id": "CAM_F2_EAST",
  "confidence": 0.94,
  "position_status": "simulated",
  "timestamp": "2026-10-17T21:00:00Z"
}
```

Ingested via `POST /observations` — the same contract a real CV system would
use later, so the abstraction boundary is an API, not a code seam. Person
observations create/update `detected_person` entities; fire/smoke observations
create hazards and seed the spread simulator.

## 10. Triage (`triage.py`)

Deterministic extraction from civilian text: floor mentions ("second floor",
"floor 2"), room references ("Studio 210" — digit cross-checked against stated
floor), people count, mobility limits ("can't walk", "wheelchair"),
consciousness ("unconscious"), smoke/fire mentions, blocked exits. Unmatched
fields are explicitly `unknown`, never guessed.

Priority engine scores: reported immediate danger, inability to self-evacuate,
people count, proximity to known/predicted fire, report age. Output:
`urgent_review | priority_review | standard_review` plus a plain-English
`reason` listing contributing factors, and
`requires_responder_review: true`. Unknown location never lowers priority; it
adds a `location unresolved — needs contact` flag.

## 11. Civilian advisories (`advisories.py`)

Per-civilian template-composed text message: situation summary from state
(hazards on their floor), their computed evacuation route rendered as walkable
instructions, responder-en-route note when applicable. Returned as a text
block plus structured metadata with `requires_command_approval: true` — the
engine drafts, the incident commander sends. Endpoints:
`GET /civilians/{id}/advisory` and a broadcast-draft variant. "Sending" is an
event-log entry (demo-level delivery).

## 12. API surface (`api.py`)

FastAPI, CORS open for localhost, OpenAPI at `/docs`, explicit error responses,
stable ids.

```
GET  /health                          GET  /building          GET  /building/graph
GET  /spatial/coordinate-system       GET  /incident/state    GET  /incident/events?since=
POST /observations
POST /civilians   GET /civilians      POST /civilians/report
GET  /civilians/{id}/advisory         GET /advisories         (all draft advisories)
POST /responders  GET /responders     POST /responders/location
GET  /responders/{id}/guidance
POST /hazards     GET /hazards        DELETE /hazards/{id}
POST /routes/compute                  GET  /routes
GET  /spread/prediction               POST /spread/ignite
POST /rescue/prioritize
```

`POST /rescue/prioritize` returns ranked rescue recommendations with suggested
responder-to-request pairings, candidate route references, explanations, and
unreachable/uncertain flags. Pairings are proposals only; no auto-dispatch.

## 13. Testing

Pytest per module plus one HTTP integration test (`TestClient`):

- Graph integrity: all edges reference real nodes; inter-floor edges are
  stairs only; coordinates carry floor ids.
- Routing: valid connections only; blocked edges excluded; multi-floor paths
  use stairwells; unreachable detection; alternate differs from primary;
  hazard update changes the route.
- Triage: extraction cases incl. unknowns staying unknown; room-only reports
  do not gain fabricated precise coordinates; unknown location never
  deprioritized.
- Spread: fire never jumps non-adjacent nodes; risk decreases with graph
  distance (sanity); surrogate AUC vs. Monte Carlo above a stated floor.
- State: event seq monotonic; polling with `since` returns exactly the delta.
- Integration: the full demo scenario through HTTP, asserting each beat.

## 14. End-to-end demo (`demo.py`)

One command, prints each beat, exits nonzero on failure:

1. Seed state: building loaded, 2+ responders, 2+ civilians, simulated person
   observations.
2. Civilian report: "I'm in Studio 210 on the second floor. There's smoke
   outside and my friend can't walk." → extraction → node resolution →
   `urgent_review`.
3. Fire observation ignites spread simulation → risk field computed.
4. Route Unit Alpha → Studio 210, avoiding predicted-risk corridors; polyline
   + AR steps printed.
5. Responder reports "east stairwell is blocked" → hazard recorded → route
   recomputed via the other stairwell → `route_updated` event.
6. Advisory text block drafted for the civilian.
7. Final `GET /incident/state` dumped as frontend-ready JSON.

## 15. Integration handoff (`INTEGRATION.md`)

Startup command, dependency install, base URL/port, OpenAPI URL, coordinate
convention, floor elevations, endpoint reference with JSON examples, marker
response shapes, polling pattern (`/incident/state` + `/incident/events`),
what is real vs. simulated, known limitations, and one full JSON example
sufficient to render an incident map. TypeScript interfaces optional, only if
time remains.

## 16. Constraints & non-goals

- No modifications outside `sentinel_engine/`, `docs/`, and root `requirements.txt`
  / `.gitignore`. (A `/demo` directory, if it appears, is read-only.)
- No facial recognition, no identity inference across cameras.
- No claims of safe routes, structural assessments, or medical triage.
- No databases, cloud services, paid APIs, WebSockets, or fine-tuned vision
  models.
- Never claim the surrogate model was trained unless training completed and
  the checkpoint exists.
