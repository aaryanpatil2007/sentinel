# Sentinel Engine — Integration Guide

Backend intelligence engine: building graph, hazard-aware routing, ML fire-spread
prediction, civilian triage, advisories, shared incident state. Decision-support
prototype — all routes/advisories require incident-commander approval.

## Start

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn sentinel_engine.api:app --port 8787
```

- Base URL: `http://localhost:8787` (note: port 8000 was already occupied on the dev
  machine by an unrelated service — use 8787 or any free port)
- OpenAPI docs: `http://localhost:8787/docs`
- CORS is open (`*`) for local development.
- Reproducible demo (no server needed): `.venv/bin/python -m sentinel_engine.demo`
- Tests: `.venv/bin/python -m pytest sentinel_engine/tests` (61 tests)

## Coordinate system

`GET /spatial/coordinate-system`. Frame **`JACOBS_LOCAL`**: local meters (NOT
lat/long), x east, y north, z up, origin at the illustrative southwest ground
corner. Floor elevations: `B` = -4.0, `F1` = 0.0, `F2` = 4.0, `F3` = 8.0.

Every position object is `{x, y, z, floor_id, coordinate_frame}`.
- 2D floor rendering: use `(x, y)` + `floor_id`.
- 3D building view: use `(x, y, z)` directly.
- Route polylines and AR step waypoints are already in this frame — **no
  client-side geometric transforms needed**.

## What is real vs simulated

- **REAL:** graph algorithms (Dijkstra), triage rules, the trained surrogate
  model and its validation methodology.
- **VERIFIED building facts** (public sources): 3 stories + basement; two main
  F1 entrances; room names — Studios 10/110/120/210/220/310, Metal Shop,
  Advanced Prototyping Lab (official Jacobs Institute spaces page); ~41 m
  east-west × ~24 m footprint at 2530 Ridge Rd (OpenStreetMap way 440146220);
  54-ft-wide bar on an east-west axis, 14-ft ceilings, LEED Platinum, Leddy
  Maytum Stacy Architects, opened 2015.
- **SIMULATED (labeled in payloads):** all coordinates, corridor layout, and
  stair/entrance placement (`provenance: "simulated"` — no public floor plans
  exist; our 40×20 m grid and 4.0 m floor spacing are illustrative but close to
  the real footprint and 14-ft ceilings); camera observations
  (`source: "simulated_camera"` — stand-in for a CV layer); fire-spread dynamics
  (plausible-physics graph simulator, **not** real fire behavior).
- **Spread surrogate:** `GradientBoostingClassifier` trained ONLY on randomized
  synthetic buildings (identity-free architectural features); Jacobs Hall held
  out of training entirely. Measured validation AUC vs simulated ground truth:
  **0.899** on held-out random buildings, **0.878** on held-out Jacobs Hall.
  It predicts OUR simulator's dynamics, not real fire. Retrain:
  `.venv/bin/python -m sentinel_engine.train_spread_model`.

## Core flows (verified payloads)

### Civilian distress report
```
POST /civilians/report
{"text": "I'm in Studio 210 on the second floor. There's smoke outside and my friend can't walk."}
```
Response (truncated): resolves the room, stores the civilian, returns priority:
```json
{"civilian": {"entity_id": "CIV_001", "graph_node_id": "F2_STUDIO_210",
  "world_position": {"x": 12.0, "y": 16.0, "z": 4.0, "floor_id": "F2", "coordinate_frame": "JACOBS_LOCAL"},
  "position_status": "reported", "flags": ["position is node anchor, not exact"]},
 "priority": {"priority": "urgent_review", "score": 6,
  "reported_conditions": ["smoke_nearby", "mobility_limited"],
  "reason": "occupant reports smoke nearby; occupant or companion cannot self-evacuate; 2 people reported together",
  "requires_responder_review": true}}
```

### Camera observation (CV stand-in — a real CV system would POST the same shape)
```
POST /observations
{"observation_id": "OBS_004", "type": "fire", "graph_node_id": "F2_CORRIDOR_EAST",
 "world_position": {"x": 28.0, "y": 10.0, "z": 4.0, "floor_id": "F2", "coordinate_frame": "JACOBS_LOCAL"},
 "camera_id": "CAM_F2_EAST", "confidence": 0.77, "source": "simulated_camera",
 "position_status": "simulated", "provenance": "simulated"}
```
`type: "person"` creates a `detected_person` entity (never auto-merged with
reported civilians); `"fire"`/`"smoke"` create hazards; fire also seeds the
spread prediction and triggers route recomputation.

### Hazard from free text (e.g. radio report "west stairwell is blocked")
```
POST /hazards
{"hazard_type": "blocked", "text": "west stairwell", "default_floor": "F2",
 "verified": true, "source": "responder_report"}
```
Verified fire/blocked hazards EXCLUDE edges; smoke multiplies cost ×5;
unverified hazards add a penalty. Any hazard change recomputes all stored
routes and emits `route_updated` events.

### Route
```
POST /routes/compute
{"responder_id": "UNIT_ALPHA", "civilian_id": "CIV_001"}
```
Response (truncated):
```json
{"route_id": "ROUTE_001", "status": "candidate",
 "nodes": ["F1_ENTRANCE_MAIN", "F1_CORRIDOR_CENTER", "F1_CORRIDOR_WEST", "F1_STAIR_A", "F2_STAIR_A", "F2_CORRIDOR_WEST", "F2_STUDIO_210"],
 "polyline": [{"x": 20.0, "y": 0.0, "z": 0.0, "floor_id": "F1", "coordinate_frame": "JACOBS_LOCAL"}, "..."],
 "steps": [{"instruction": "Proceed 10 m to Center Corridor (F1)", "to_node": "F1_CORRIDOR_CENTER",
   "waypoint": {"x": 20.0, "y": 10.0, "z": 0.0, "floor_id": "F1", "coordinate_frame": "JACOBS_LOCAL"},
   "distance_m": 10.0, "bearing_degrees": 0.0}, "..."],
 "total_distance_m": 42.0, "total_cost": 230.2,
 "hazards_considered": ["HAZ_001", "HAZ_002"],
 "assumptions": ["Illustrative simulated building geometry",
                 "Graph cost is not a safety guarantee; command approval required"],
 "requires_command_approval": true, "alternate": {"route_id": "ROUTE_001_ALT", "...": "..."}}
```
`total_distance_m` (meters) and `total_cost` (hazard/risk-weighted) are distinct
on purpose. Draw the **polyline**; the AR view uses **steps** (waypoint = AR
anchor, bearing in degrees clockwise from +y/north).

### AR guidance (poll after any hazard change — it always serves the current route)
```
GET /responders/UNIT_ALPHA/guidance
→ {"route_id": "ROUTE_001", "status": "candidate", "destination_node": "F2_STUDIO_210",
   "next_steps": [ ...steps from the responder's nearest on-route node... ]}
```

### Spread prediction (building-view heat overlay)
```
GET /spread/prediction
→ {"fire_nodes": ["F2_CORRIDOR_EAST"], "horizon_minutes": 10,
   "method": "surrogate_ml_simulated", "provenance": "simulated",
   "risk": {"F2_CORRIDOR_EAST": 1.0, "F2_CORRIDOR_CENTER": 0.9894, "B_STUDIO_10": 0.0279, "...": 0.0}}
```
`risk` is per-node ignition probability over the horizon; color nodes/regions by
it. Demo control: `POST /spread/ignite {"node_id": "F2_CORRIDOR_EAST"}`.

### Advisory draft (text block to show the commander for approval)
```
GET /civilians/CIV_001/advisory    (also GET /advisories for all)
→ {"civilian_id": "CIV_001", "requires_command_approval": true,
   "message": "Fire and Smoke has been reported on your floor (F2). Recommended evacuation (pending command approval): Proceed 6 m to West Corridor (F2) Then ... You will exit at East Entrance. A responder team has been assigned to review your situation.",
   "based_on": {"hazard_ids": ["HAZ_001", "HAZ_002"], "route_id": "EVAC_CIV_001", "responder_en_route": true}}
```

### Rescue prioritization
```
POST /rescue/prioritize
→ {"recommendations": [{"civilian_id": "CIV_001", "priority": "urgent_review", "score": 6,
    "reason": "...", "flags": [], "nearest_responder_id": "UNIT_ALPHA",
    "route_status": "candidate", "estimated_cost": 230.2, "requires_command_approval": true}]}
```
Proposals only — no auto-dispatch.

## Polling

- `GET /incident/state` — full picture: `{building_id, coordinate_frame, timestamp,
  entities, hazards, routes, last_event_seq}`.
- `GET /incident/events?since=<last seq>` — ordered deltas
  `{seq, timestamp, event_type, payload}`. Event types: `entity_registered`,
  `entity_location_updated`, `civilian_report`, `observation_ingested`,
  `hazard_added`, `hazard_removed`, `route_computed`, `route_updated`,
  `advisory_drafted`, `rescue_prioritized`.
- Suggested loop: poll events every 1–2 s; on `route_updated`, refresh routes and
  guidance.

## Map rendering checklist

| Marker | Source |
|---|---|
| Floor outlines / rooms / corridors | `GET /building/graph` — node `x,y,z,floor_id,node_type,label`; edges for corridor lines |
| Civilians / responders / detections | `/incident/state` entities → `world_position` (+ `position_status`, `flags` for "node anchor" honesty) |
| Hazards (fire/smoke/blocked) | `/incident/state` hazards → `node_id`/`edge_id` → look up coords in `/building/graph` |
| Route polylines | route `polyline` (ordered positions, already per-floor) |
| Fire-risk heat overlay | `/spread/prediction` `risk` dict keyed by `node_id` |
| Exits / staging | `/building/graph` nodes with `node_type` `entrance` / `staging` |

Every object carries `floor_id` — filter by the selected floor for 2D, or use
`z` for the 3D view.

## Known limitations

In-memory state (resets on restart, single incident). No auth. Identity never
merged across cameras (separate `DET_*` records). Room-level positions are node
anchors, not exact (flagged on the entity). The elevator exists in the graph but
is always excluded from routing. Routes are graph candidates requiring command
approval — the cost model is not a safety guarantee. Fire-spread dynamics are a
simulator, and the ML surrogate approximates that simulator (AUC above), not
real fire physics.
