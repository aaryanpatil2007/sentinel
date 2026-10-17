# Sentinel Intelligence Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Sentinel intelligence backend: an illustrative Jacobs Hall spatial model, shared incident state, hazard-aware routing with AR guidance, an ML fire-spread predictor, civilian triage/advisories, and a FastAPI service with a reproducible end-to-end demo.

**Architecture:** Layered Python package `sentinel_engine/` — pure-Python domain modules (building, state, routing, spread, triage, advisories, perception) with zero web imports, FastAPI (`api.py`) as a thin adapter, in-memory state with a seq-numbered event log for polling. Fire-spread surrogate is a scikit-learn classifier trained on rollouts from randomized synthetic buildings, validated on held-out Jacobs Hall.

**Tech Stack:** Python 3.10+, FastAPI, uvicorn, Pydantic v2, scikit-learn, joblib, pytest, httpx (TestClient).

**Spec:** `docs/superpowers/specs/2026-10-17-sentinel-engine-design.md`

## Global Constraints

- Coordinate frame id is exactly `JACOBS_LOCAL`; positions are `{x, y, z, floor_id}` in local meters (x east, y north, z up). Never lat/long.
- Floor elevations: `B` = -4.0, `F1` = 0.0, `F2` = 4.0, `F3` = 8.0.
- Every entity/observation/hazard/route point carries `source`, `position_status` (`reported|simulated|estimated|unknown`), and ISO-8601 UTC `timestamp` (or `last_updated`).
- All building geometry and perception data labeled `"provenance": "simulated"`; routes always `status: "candidate"` (or `"unreachable"`) with `requires_command_approval: true`. Never the word "safe" in generated output.
- Inter-floor edges are only `stairs` or `elevator`; `elevator` edges are always excluded from routing.
- Unknown civilian location must never lower priority; it adds flag `"location unresolved — needs contact"`.
- No files created or modified outside `sentinel_engine/`, `docs/`, root `requirements.txt`, and root `.gitignore`. If a `/demo` directory appears, it is read-only.
- Dependencies limited to: fastapi, uvicorn, pydantic, scikit-learn, joblib, pytest, httpx. No networkx, no torch, no OpenCV, no databases.
- Virtualenv at `.venv/`; run everything with `.venv/bin/python`. Commit after every task; never push.
- Do not claim the surrogate model is trained unless `sentinel_engine/data/spread_model.joblib` exists and the validation test passes.

---

### Task 1: Scaffolding, building data, and `Building` class

**Files:**
- Create: `requirements.txt`, `.gitignore`, `sentinel_engine/__init__.py`, `sentinel_engine/tests/__init__.py`
- Create: `sentinel_engine/data_builder.py` (writes `sentinel_engine/data/jacobs_hall.json`)
- Create: `sentinel_engine/building.py`
- Test: `sentinel_engine/tests/test_building.py`

**Interfaces:**
- Produces: `Node(node_id, floor_id, node_type, label, x, y, z)` and `Edge(edge_id, from_node, to_node, distance_m, edge_type)` frozen dataclasses; `Building.load(path=None) -> Building` with attributes `building_id`, `coordinate_frame`, `floors` (list of dicts with `floor_id`, `name`, `elevation_m`), `nodes: dict[str, Node]`, `edges: dict[str, Edge]`, `adjacency: dict[str, list[tuple[str, str]]]` ((edge_id, neighbor) pairs, bidirectional); methods `to_dict() -> dict`, `node_position(node_id) -> dict` (returns `{x,y,z,floor_id,coordinate_frame}`), `resolve_location(text, default_floor=None) -> dict | None` (returns `{node_id, floor_id, match_type, matched_text, conflict}`), `entrance_nodes() -> list[str]`.
- Node types used everywhere: `room | corridor | stairs | entrance | staging | elevator`. Edge types: `corridor | doorway | stairs | exterior_door | elevator`.
- Key node ids later tasks rely on: `F2_STUDIO_210`, `F3_STUDIO_310`, `F1_ENTRANCE_MAIN`, `F1_ENTRANCE_EAST`, `EXT_STAGING`, `{floor}_STAIR_A` (west), `{floor}_STAIR_B` (east), `{floor}_CORRIDOR_WEST|CENTER|EAST` for floors `B, F1, F2, F3`.

- [ ] **Step 1: Scaffold project**

Create `requirements.txt`:

```text
fastapi
uvicorn
pydantic>=2
scikit-learn
joblib
pytest
httpx
```

Create `.gitignore`:

```text
.venv/
__pycache__/
*.pyc
.pytest_cache/
```

Create empty `sentinel_engine/__init__.py` and `sentinel_engine/tests/__init__.py`.

Run: `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt`
Expected: install succeeds.

- [ ] **Step 2: Write `data_builder.py`**

```python
"""Builds the illustrative Jacobs Hall model. ALL GEOMETRY IS SIMULATED.

Floor count, room naming style (numbered studios, makerspace labs) informed by
the public Jacobs Institute "our spaces at a glance" description. Coordinates,
distances, stair/entrance placement are illustrative, not surveyed.
"""
import json
import math
from pathlib import Path

DATA_PATH = Path(__file__).parent / "data" / "jacobs_hall.json"

FLOORS = [
    {"floor_id": "B", "name": "Basement", "elevation_m": -4.0},
    {"floor_id": "F1", "name": "Floor 1", "elevation_m": 0.0},
    {"floor_id": "F2", "name": "Floor 2", "elevation_m": 4.0},
    {"floor_id": "F3", "name": "Floor 3", "elevation_m": 8.0},
]

ROOMS = {  # floor -> [(suffix, label, x, y)]
    "B": [("MAKERSPACE", "Basement Makerspace", 12, 16), ("WOODSHOP", "Wood Shop", 28, 16)],
    "F1": [("DESIGN_SHOWCASE", "Design Showcase", 12, 16), ("ELECTRONICS_LAB", "Electronics Lab", 28, 16)],
    "F2": [("STUDIO_210", "Studio 210", 12, 16), ("STUDIO_220", "Studio 220", 28, 16)],
    "F3": [("STUDIO_310", "Studio 310", 12, 16), ("STUDIO_320", "Studio 320", 28, 16)],
}


def _dist(a, b):
    return round(math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"])), 1)


def build_jacobs_hall() -> dict:
    nodes, edges = [], []

    def add_node(node_id, floor_id, node_type, label, x, y, z):
        nodes.append({"node_id": node_id, "floor_id": floor_id, "node_type": node_type,
                      "label": label, "x": float(x), "y": float(y), "z": float(z)})

    def add_edge(a, b, edge_type):
        na = next(n for n in nodes if n["node_id"] == a)
        nb = next(n for n in nodes if n["node_id"] == b)
        edges.append({"edge_id": f"E{len(edges):03d}", "from_node": a, "to_node": b,
                      "distance_m": _dist(na, nb), "edge_type": edge_type})

    for f in FLOORS:
        fid, z = f["floor_id"], f["elevation_m"]
        add_node(f"{fid}_STAIR_A", fid, "stairs", f"West Stairwell ({fid})", 5, 10, z)
        add_node(f"{fid}_STAIR_B", fid, "stairs", f"East Stairwell ({fid})", 35, 10, z)
        add_node(f"{fid}_ELEVATOR", fid, "elevator", f"Elevator ({fid})", 20, 12, z)
        for side, x in [("WEST", 12), ("CENTER", 20), ("EAST", 28)]:
            add_node(f"{fid}_CORRIDOR_{side}", fid, "corridor", f"{side.title()} Corridor ({fid})", x, 10, z)
        for suffix, label, x, y in ROOMS[fid]:
            add_node(f"{fid}_{suffix}", fid, "room", label, x, y, z)
        add_edge(f"{fid}_CORRIDOR_WEST", f"{fid}_CORRIDOR_CENTER", "corridor")
        add_edge(f"{fid}_CORRIDOR_CENTER", f"{fid}_CORRIDOR_EAST", "corridor")
        add_edge(f"{fid}_STAIR_A", f"{fid}_CORRIDOR_WEST", "doorway")
        add_edge(f"{fid}_STAIR_B", f"{fid}_CORRIDOR_EAST", "doorway")
        add_edge(f"{fid}_ELEVATOR", f"{fid}_CORRIDOR_CENTER", "doorway")
        add_edge(f"{fid}_{ROOMS[fid][0][0]}", f"{fid}_CORRIDOR_WEST", "doorway")
        add_edge(f"{fid}_{ROOMS[fid][1][0]}", f"{fid}_CORRIDOR_EAST", "doorway")

    for lower, upper in zip(FLOORS, FLOORS[1:]):
        for stair in ("STAIR_A", "STAIR_B"):
            add_edge(f"{lower['floor_id']}_{stair}", f"{upper['floor_id']}_{stair}", "stairs")
        add_edge(f"{lower['floor_id']}_ELEVATOR", f"{upper['floor_id']}_ELEVATOR", "elevator")

    add_node("F1_ENTRANCE_MAIN", "F1", "entrance", "Main Entrance", 20, 0, 0.0)
    add_node("F1_ENTRANCE_EAST", "F1", "entrance", "East Entrance", 35, 0, 0.0)
    add_node("EXT_STAGING", "F1", "staging", "Exterior Staging Area", 20, -10, 0.0)
    add_edge("F1_ENTRANCE_MAIN", "F1_CORRIDOR_CENTER", "exterior_door")
    add_edge("F1_ENTRANCE_EAST", "F1_CORRIDOR_EAST", "exterior_door")
    add_edge("EXT_STAGING", "F1_ENTRANCE_MAIN", "exterior_door")

    return {
        "building_id": "jacobs_hall",
        "coordinate_frame": "JACOBS_LOCAL",
        "origin_description": "Illustrative southwest ground-floor corner; x east, y north, z up, meters.",
        "provenance": "simulated",
        "source_note": ("Floor count and room naming style informed by the public Jacobs Institute "
                        "space descriptions; all coordinates and connections are illustrative."),
        "floors": FLOORS,
        "nodes": nodes,
        "edges": edges,
    }


if __name__ == "__main__":
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(build_jacobs_hall(), indent=2))
    print(f"wrote {DATA_PATH}")
```

Run: `.venv/bin/python -m sentinel_engine.data_builder`
Expected: `wrote .../sentinel_engine/data/jacobs_hall.json`

- [ ] **Step 3: Write failing tests**

`sentinel_engine/tests/test_building.py`:

```python
import pytest
from sentinel_engine.building import Building


@pytest.fixture(scope="module")
def building():
    return Building.load()


def test_loads_four_floors_and_frame(building):
    assert building.building_id == "jacobs_hall"
    assert building.coordinate_frame == "JACOBS_LOCAL"
    assert [f["floor_id"] for f in building.floors] == ["B", "F1", "F2", "F3"]


def test_all_edges_reference_existing_nodes(building):
    for e in building.edges.values():
        assert e.from_node in building.nodes and e.to_node in building.nodes


def test_interfloor_edges_are_stairs_or_elevator_only(building):
    for e in building.edges.values():
        fa = building.nodes[e.from_node].floor_id
        fb = building.nodes[e.to_node].floor_id
        if fa != fb:
            assert e.edge_type in ("stairs", "elevator")


def test_adjacency_is_bidirectional(building):
    neighbors = {n for _, n in building.adjacency["F2_CORRIDOR_WEST"]}
    assert "F2_CORRIDOR_CENTER" in neighbors
    back = {n for _, n in building.adjacency["F2_CORRIDOR_CENTER"]}
    assert "F2_CORRIDOR_WEST" in back


def test_node_position_has_frame_and_floor(building):
    pos = building.node_position("F2_STUDIO_210")
    assert pos == {"x": 12.0, "y": 16.0, "z": 4.0, "floor_id": "F2",
                   "coordinate_frame": "JACOBS_LOCAL"}


def test_resolve_room_number_with_matching_floor(building):
    r = building.resolve_location("I'm in Studio 210 on the second floor")
    assert r["node_id"] == "F2_STUDIO_210"
    assert r["floor_id"] == "F2"
    assert r["conflict"] is None


def test_resolve_room_number_floor_conflict_flagged(building):
    r = building.resolve_location("Studio 210 on the third floor")
    assert r["node_id"] == "F2_STUDIO_210"
    assert r["conflict"] is not None


def test_resolve_east_stairwell_with_floor(building):
    r = building.resolve_location("east stairwell", default_floor="F2")
    assert r["node_id"] == "F2_STAIR_B"


def test_resolve_unknown_returns_none(building):
    assert building.resolve_location("somewhere in the parking lot") is None


def test_entrances(building):
    assert set(building.entrance_nodes()) == {"F1_ENTRANCE_MAIN", "F1_ENTRANCE_EAST"}
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_building.py -v`
Expected: FAIL / errors with "No module named 'sentinel_engine.building'".

- [ ] **Step 5: Implement `building.py`**

```python
"""Building spatial model: nodes, edges, coordinate frame, location resolution."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DATA_PATH = Path(__file__).parent / "data" / "jacobs_hall.json"

FLOOR_WORDS = {
    "basement": "B",
    "first floor": "F1", "floor 1": "F1", "floor one": "F1", "1st floor": "F1", "ground floor": "F1",
    "second floor": "F2", "floor 2": "F2", "floor two": "F2", "2nd floor": "F2",
    "third floor": "F3", "floor 3": "F3", "floor three": "F3", "3rd floor": "F3",
}


@dataclass(frozen=True)
class Node:
    node_id: str
    floor_id: str
    node_type: str
    label: str
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class Edge:
    edge_id: str
    from_node: str
    to_node: str
    distance_m: float
    edge_type: str


class Building:
    def __init__(self, data: dict):
        self._data = data
        self.building_id = data["building_id"]
        self.coordinate_frame = data["coordinate_frame"]
        self.floors = data["floors"]
        self.nodes = {n["node_id"]: Node(**n) for n in data["nodes"]}
        self.edges = {e["edge_id"]: Edge(**e) for e in data["edges"]}
        self.adjacency: dict[str, list[tuple[str, str]]] = {nid: [] for nid in self.nodes}
        for e in self.edges.values():
            if e.from_node not in self.nodes or e.to_node not in self.nodes:
                raise ValueError(f"edge {e.edge_id} references unknown node")
            self.adjacency[e.from_node].append((e.edge_id, e.to_node))
            self.adjacency[e.to_node].append((e.edge_id, e.from_node))

    @classmethod
    def load(cls, path: str | Path | None = None) -> "Building":
        return cls(json.loads(Path(path or DEFAULT_DATA_PATH).read_text()))

    def to_dict(self) -> dict:
        return self._data

    def node_position(self, node_id: str) -> dict:
        n = self.nodes[node_id]
        return {"x": n.x, "y": n.y, "z": n.z, "floor_id": n.floor_id,
                "coordinate_frame": self.coordinate_frame}

    def entrance_nodes(self) -> list[str]:
        return [n.node_id for n in self.nodes.values() if n.node_type == "entrance"]

    def resolve_location(self, text: str, default_floor: str | None = None) -> dict | None:
        t = text.lower()
        floor = default_floor
        for phrase, fid in FLOOR_WORDS.items():
            if phrase in t:
                floor = fid
                break

        # Room number, e.g. "210" / "studio 310": leading digit implies floor.
        m = re.search(r"\b([1-3])\d{2}\b", t)
        if m:
            number = m.group(0)
            implied = f"F{m.group(1)}"
            for n in self.nodes.values():
                if n.node_type == "room" and number in n.label:
                    conflict = None
                    if floor and floor != n.floor_id:
                        conflict = (f"room {number} is on {n.floor_id} but report says {floor}; "
                                    "using room, flagged for review")
                    return {"node_id": n.node_id, "floor_id": n.floor_id,
                            "match_type": "room_number", "matched_text": number,
                            "conflict": conflict}
            _ = implied  # number matched no room; fall through to other matchers

        # Room label substring, e.g. "wood shop", "electronics lab".
        for n in self.nodes.values():
            if n.node_type == "room" and n.label.lower() in t:
                return {"node_id": n.node_id, "floor_id": n.floor_id,
                        "match_type": "room_label", "matched_text": n.label, "conflict": None}

        # Stairwells / corridors, qualified by side; needs a floor to pick a node.
        side_map = {"east": "B", "west": "A"}
        for side, letter in side_map.items():
            if f"{side} stair" in t and floor:
                nid = f"{floor}_STAIR_{letter}"
                if nid in self.nodes:
                    return {"node_id": nid, "floor_id": floor, "match_type": "stairwell",
                            "matched_text": f"{side} stairwell", "conflict": None}
        for side in ("west", "center", "east"):
            if f"{side} corridor" in t and floor:
                nid = f"{floor}_CORRIDOR_{side.upper()}"
                if nid in self.nodes:
                    return {"node_id": nid, "floor_id": floor, "match_type": "corridor",
                            "matched_text": f"{side} corridor", "conflict": None}

        # Floor-only mention: anchor to that floor's center corridor, low precision.
        if floor:
            nid = f"{floor}_CORRIDOR_CENTER"
            if nid in self.nodes:
                return {"node_id": nid, "floor_id": floor, "match_type": "floor_only",
                        "matched_text": floor, "conflict": None}
        return None
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_building.py -v`
Expected: all 10 PASS.

- [ ] **Step 7: Commit**

```bash
git add requirements.txt .gitignore sentinel_engine/
git commit -m "feat: scaffold engine, illustrative Jacobs Hall model, Building class"
```

---

### Task 2: Incident state and event log

**Files:**
- Create: `sentinel_engine/state.py`
- Test: `sentinel_engine/tests/test_state.py`

**Interfaces:**
- Consumes: `Building` from Task 1.
- Produces: `IncidentState(building)` with: `register_entity(entity_type, entity_id=None, name=None, world_position=None, graph_node_id=None, source="manual", position_status="unknown") -> dict`; `update_entity_location(entity_id, world_position=None, graph_node_id=None, source="manual", position_status="reported") -> dict`; `get_entities(entity_type=None) -> list[dict]`; `get_entity(entity_id) -> dict | None`; `add_hazard(hazard_type, node_id=None, edge_id=None, verified=False, source="manual", description="") -> dict`; `remove_hazard(hazard_id) -> bool`; `get_hazards() -> list[dict]`; `set_route(route: dict, meta: dict) -> None`; `get_routes() -> list[dict]` (each `{**route, "meta": meta}`); `append_event(event_type, payload) -> dict`; `events_since(seq: int) -> list[dict]`; `snapshot() -> dict`.
- Entity record shape: `{entity_id, entity_type, name, world_position, graph_node_id, source, position_status, last_updated, report, priority, flags}` (`report`/`priority` start `None`, `flags` a list — Task 6 fills them). Auto ids: `CIV_001`, `UNIT_001`, `DET_001` by type prefix map `{"civilian": "CIV", "responder": "UNIT", "detected_person": "DET"}`. Hazard record: `{hazard_id ("HAZ_001"), hazard_type, node_id, edge_id, verified, source, description, created_at}`. Event record: `{seq, timestamp, event_type, payload}` with seq starting at 1. If `graph_node_id` is given without `world_position`, world_position is filled from `building.node_position(graph_node_id)` with `position_status` forced to `"estimated"` if the caller said `"reported"` only a room/node (room centroid is a display anchor, not a true position) — implemented as: when node-only, record `world_position` from the node and keep the caller's `position_status`, but append flag `"position is node anchor, not exact"`.
- `snapshot()` returns `{building_id, coordinate_frame, timestamp, entities, hazards, routes, last_event_seq}`.

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_state.py`:

```python
import pytest
from sentinel_engine.building import Building
from sentinel_engine.state import IncidentState


@pytest.fixture
def state():
    return IncidentState(Building.load())


def test_register_entity_auto_id_and_event(state):
    civ = state.register_entity("civilian", name="Caller 1")
    assert civ["entity_id"] == "CIV_001"
    assert civ["position_status"] == "unknown"
    ev = state.events_since(0)
    assert ev[-1]["event_type"] == "entity_registered"
    assert ev[-1]["seq"] == 1


def test_node_only_location_gets_anchor_flag(state):
    civ = state.register_entity("civilian", graph_node_id="F2_STUDIO_210",
                                source="civilian_report", position_status="reported")
    assert civ["world_position"]["floor_id"] == "F2"
    assert "position is node anchor, not exact" in civ["flags"]


def test_update_location(state):
    unit = state.register_entity("responder", entity_id="UNIT_ALPHA")
    updated = state.update_entity_location("UNIT_ALPHA", graph_node_id="F1_ENTRANCE_MAIN",
                                           source="responder_report", position_status="reported")
    assert updated["graph_node_id"] == "F1_ENTRANCE_MAIN"
    assert unit["entity_id"] == "UNIT_ALPHA"


def test_hazard_lifecycle_and_events(state):
    h = state.add_hazard("smoke", node_id="F2_CORRIDOR_EAST", source="responder_report")
    assert h["hazard_id"] == "HAZ_001"
    assert not h["verified"]
    assert state.remove_hazard("HAZ_001") is True
    types = [e["event_type"] for e in state.events_since(0)]
    assert "hazard_added" in types and "hazard_removed" in types


def test_events_since_returns_exact_delta(state):
    state.register_entity("civilian")
    state.register_entity("civilian")
    all_events = state.events_since(0)
    assert [e["seq"] for e in all_events] == [1, 2]
    assert state.events_since(1)[0]["seq"] == 2
    assert state.events_since(2) == []


def test_snapshot_shape(state):
    state.register_entity("civilian")
    state.add_hazard("fire", node_id="F2_CORRIDOR_EAST")
    snap = state.snapshot()
    assert snap["building_id"] == "jacobs_hall"
    assert snap["coordinate_frame"] == "JACOBS_LOCAL"
    assert len(snap["entities"]) == 1 and len(snap["hazards"]) == 1
    assert snap["last_event_seq"] == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_state.py -v`
Expected: FAIL with "No module named 'sentinel_engine.state'".

- [ ] **Step 3: Implement `state.py`**

```python
"""In-memory shared incident state with append-only event log."""
from __future__ import annotations

from datetime import datetime, timezone

from .building import Building

ID_PREFIX = {"civilian": "CIV", "responder": "UNIT", "detected_person": "DET"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class IncidentState:
    def __init__(self, building: Building):
        self.building = building
        self.entities: dict[str, dict] = {}
        self.hazards: dict[str, dict] = {}
        self.routes: dict[str, dict] = {}
        self.events: list[dict] = []
        self._counters: dict[str, int] = {}

    def _next_id(self, prefix: str) -> str:
        self._counters[prefix] = self._counters.get(prefix, 0) + 1
        return f"{prefix}_{self._counters[prefix]:03d}"

    def append_event(self, event_type: str, payload: dict) -> dict:
        event = {"seq": len(self.events) + 1, "timestamp": _now(),
                 "event_type": event_type, "payload": payload}
        self.events.append(event)
        return event

    def events_since(self, seq: int) -> list[dict]:
        return [e for e in self.events if e["seq"] > seq]

    def _apply_location(self, entity: dict, world_position, graph_node_id,
                        source: str, position_status: str) -> None:
        if graph_node_id is not None and world_position is None:
            world_position = self.building.node_position(graph_node_id)
            flag = "position is node anchor, not exact"
            if flag not in entity["flags"]:
                entity["flags"].append(flag)
        entity.update(world_position=world_position, graph_node_id=graph_node_id,
                      source=source, position_status=position_status, last_updated=_now())

    def register_entity(self, entity_type: str, entity_id: str | None = None,
                        name: str | None = None, world_position: dict | None = None,
                        graph_node_id: str | None = None, source: str = "manual",
                        position_status: str = "unknown") -> dict:
        entity_id = entity_id or self._next_id(ID_PREFIX[entity_type])
        entity = {"entity_id": entity_id, "entity_type": entity_type, "name": name,
                  "world_position": None, "graph_node_id": None, "source": source,
                  "position_status": position_status, "last_updated": _now(),
                  "report": None, "priority": None, "flags": []}
        if world_position or graph_node_id:
            self._apply_location(entity, world_position, graph_node_id, source, position_status)
        self.entities[entity_id] = entity
        self.append_event("entity_registered", {"entity_id": entity_id, "entity_type": entity_type})
        return entity

    def update_entity_location(self, entity_id: str, world_position: dict | None = None,
                               graph_node_id: str | None = None, source: str = "manual",
                               position_status: str = "reported") -> dict:
        entity = self.entities[entity_id]
        self._apply_location(entity, world_position, graph_node_id, source, position_status)
        self.append_event("entity_location_updated",
                          {"entity_id": entity_id, "graph_node_id": graph_node_id})
        return entity

    def get_entities(self, entity_type: str | None = None) -> list[dict]:
        return [e for e in self.entities.values()
                if entity_type is None or e["entity_type"] == entity_type]

    def get_entity(self, entity_id: str) -> dict | None:
        return self.entities.get(entity_id)

    def add_hazard(self, hazard_type: str, node_id: str | None = None,
                   edge_id: str | None = None, verified: bool = False,
                   source: str = "manual", description: str = "") -> dict:
        hazard = {"hazard_id": self._next_id("HAZ"), "hazard_type": hazard_type,
                  "node_id": node_id, "edge_id": edge_id, "verified": verified,
                  "source": source, "description": description, "created_at": _now()}
        self.hazards[hazard["hazard_id"]] = hazard
        self.append_event("hazard_added", hazard)
        return hazard

    def remove_hazard(self, hazard_id: str) -> bool:
        hazard = self.hazards.pop(hazard_id, None)
        if hazard:
            self.append_event("hazard_removed", {"hazard_id": hazard_id})
        return hazard is not None

    def get_hazards(self) -> list[dict]:
        return list(self.hazards.values())

    def set_route(self, route: dict, meta: dict) -> None:
        self.routes[route["route_id"]] = {**route, "meta": meta}

    def get_routes(self) -> list[dict]:
        return list(self.routes.values())

    def snapshot(self) -> dict:
        return {"building_id": self.building.building_id,
                "coordinate_frame": self.building.coordinate_frame,
                "timestamp": _now(),
                "entities": list(self.entities.values()),
                "hazards": list(self.hazards.values()),
                "routes": self.get_routes(),
                "last_event_seq": len(self.events)}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_state.py -v`
Expected: all 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add sentinel_engine/state.py sentinel_engine/tests/test_state.py
git commit -m "feat: incident state with entities, hazards, routes, event log"
```

---

### Task 3: Hazard-aware routing, polylines, AR guidance steps

**Files:**
- Create: `sentinel_engine/routing.py`
- Test: `sentinel_engine/tests/test_routing.py`

**Interfaces:**
- Consumes: `Building`, `Node`, `Edge` (Task 1); hazard dict shape (Task 2).
- Produces:
  - `DEFAULT_WEIGHTS = {"smoke_penalty": 4.0, "unverified_hazard_penalty": 1.5, "uncertainty_penalty": 0.5, "risk_lambda": 8.0}`
  - `edge_costs(building, hazards, risk=None, weights=None) -> dict[str, float | None]` (`None` = excluded; elevator edges always `None`; verified fire/blocked excluded; smoke multiplies; unverified fire/blocked penalized).
  - `compute_route(building, start_node, destination_node, hazards=(), risk=None, weights=None, route_id="ROUTE_001", include_alternate=True) -> dict` — route dict: `{route_id, status ("candidate"|"unreachable"), start_node, destination_node, nodes, edge_ids, polyline, steps, total_distance_m, total_cost, hazards_considered, assumptions, requires_command_approval, unreachable_reason, alternate}`. `polyline` = list of `{x,y,z,floor_id,coordinate_frame}`; `steps` = list of `{instruction, to_node, waypoint, distance_m, bearing_degrees}`. `alternate` = same shape with `route_id + "_ALT"` and `alternate: None`, only when its node list differs, else `None`.
  - `nearest_exit_route(building, from_node, hazards=(), risk=None, weights=None, route_id="EVAC_001") -> dict` — lowest-cost candidate route to any entrance node (tries all, returns best; unreachable dict if none).

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_routing.py`:

```python
import pytest
from sentinel_engine.building import Building
from sentinel_engine.routing import compute_route, edge_costs, nearest_exit_route


@pytest.fixture(scope="module")
def building():
    return Building.load()


def _hazard(hazard_type, node_id=None, edge_id=None, verified=False):
    return {"hazard_id": "HAZ_X", "hazard_type": hazard_type, "node_id": node_id,
            "edge_id": edge_id, "verified": verified, "source": "test", "description": ""}


def test_route_uses_valid_connections_and_stairs(building):
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210")
    assert route["status"] == "candidate"
    assert route["requires_command_approval"] is True
    # every consecutive pair must be a real edge
    for a, b in zip(route["nodes"], route["nodes"][1:]):
        assert any(n == b for _, n in building.adjacency[a])
    # crosses floors only via stair nodes
    floors = [building.nodes[n].floor_id for n in route["nodes"]]
    for i in range(len(floors) - 1):
        if floors[i] != floors[i + 1]:
            assert "STAIR" in route["nodes"][i] and "STAIR" in route["nodes"][i + 1]


def test_polyline_and_steps_shapes(building):
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210")
    assert len(route["polyline"]) == len(route["nodes"])
    assert route["polyline"][0]["coordinate_frame"] == "JACOBS_LOCAL"
    assert len(route["steps"]) == len(route["nodes"]) - 1
    step = route["steps"][0]
    assert {"instruction", "to_node", "waypoint", "distance_m", "bearing_degrees"} <= set(step)


def test_elevator_never_used(building):
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F3_STUDIO_310")
    assert not any("ELEVATOR" in n for n in route["nodes"])


def test_verified_blocked_edge_excluded(building):
    # block east stairwell F1->F2 by blocking the F2 east stair node
    hazards = [_hazard("blocked", node_id="F2_STAIR_B", verified=True)]
    route = compute_route(building, "F1_ENTRANCE_EAST", "F2_STUDIO_220", hazards=hazards)
    assert route["status"] == "candidate"
    assert "F2_STAIR_B" not in route["nodes"]  # must detour via west stairwell


def test_smoke_penalizes_but_allows(building):
    clear = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210")
    hazards = [_hazard("smoke", node_id="F2_CORRIDOR_WEST")]
    smoky = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", hazards=hazards)
    assert smoky["total_cost"] > clear["total_cost"]
    assert "HAZ_X" in smoky["hazards_considered"]


def test_unreachable_when_all_paths_blocked(building):
    hazards = [_hazard("blocked", node_id="F2_STAIR_A", verified=True),
               _hazard("blocked", node_id="F2_STAIR_B", verified=True)]
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", hazards=hazards)
    assert route["status"] == "unreachable"
    assert route["unreachable_reason"]


def test_risk_field_bends_route(building):
    # High predicted risk on west corridor F2 should push route east
    risk = {"F2_CORRIDOR_WEST": 0.9, "F2_STAIR_A": 0.9}
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_220", risk=risk)
    assert "F2_STAIR_A" not in route["nodes"]


def test_alternate_differs_when_it_exists(building):
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210")
    assert route["alternate"] is not None
    assert route["alternate"]["nodes"] != route["nodes"]


def test_distance_vs_cost_distinct_under_hazard(building):
    hazards = [_hazard("smoke", node_id="F1_CORRIDOR_CENTER")]
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", hazards=hazards)
    assert route["total_cost"] > route["total_distance_m"]


def test_nearest_exit_route(building):
    evac = nearest_exit_route(building, "F2_STUDIO_210")
    assert evac["status"] == "candidate"
    assert evac["nodes"][-1] in ("F1_ENTRANCE_MAIN", "F1_ENTRANCE_EAST")


def test_edge_costs_excludes_verified_fire(building):
    hazards = [_hazard("fire", node_id="F2_CORRIDOR_EAST", verified=True)]
    costs = edge_costs(building, hazards)
    touching = [eid for eid, e in building.edges.items()
                if "F2_CORRIDOR_EAST" in (e.from_node, e.to_node)]
    assert all(costs[eid] is None for eid in touching)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_routing.py -v`
Expected: FAIL with "No module named 'sentinel_engine.routing'".

- [ ] **Step 3: Implement `routing.py`**

```python
"""Hazard-aware Dijkstra routing with 3D polylines and AR guidance steps."""
from __future__ import annotations

import heapq
import math

from .building import Building

DEFAULT_WEIGHTS = {"smoke_penalty": 4.0, "unverified_hazard_penalty": 1.5,
                   "uncertainty_penalty": 0.5, "risk_lambda": 8.0}

BASE_ASSUMPTIONS = ["Illustrative simulated building geometry",
                    "Graph cost is not a safety guarantee; command approval required"]


def edge_costs(building: Building, hazards=(), risk: dict | None = None,
               weights: dict | None = None) -> dict[str, float | None]:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    risk = risk or {}
    node_h: dict[str, list] = {}
    edge_h: dict[str, list] = {}
    for h in hazards:
        if h.get("node_id"):
            node_h.setdefault(h["node_id"], []).append(h)
        if h.get("edge_id"):
            edge_h.setdefault(h["edge_id"], []).append(h)

    costs: dict[str, float | None] = {}
    for eid, e in building.edges.items():
        if e.edge_type == "elevator":
            costs[eid] = None
            continue
        hs = edge_h.get(eid, []) + node_h.get(e.from_node, []) + node_h.get(e.to_node, [])
        if any(h["hazard_type"] in ("fire", "blocked") and h["verified"] for h in hs):
            costs[eid] = None
            continue
        mult = 1.0
        if any(h["hazard_type"] == "smoke" for h in hs):
            mult += w["smoke_penalty"]
        if any(h["hazard_type"] in ("fire", "blocked") and not h["verified"] for h in hs):
            mult += w["unverified_hazard_penalty"] + w["uncertainty_penalty"]
        edge_risk = max(risk.get(e.from_node, 0.0), risk.get(e.to_node, 0.0))
        mult += w["risk_lambda"] * edge_risk
        costs[eid] = e.distance_m * mult
    return costs


def _dijkstra(building: Building, costs, start, dest):
    dist = {start: 0.0}
    prev: dict[str, tuple[str, str]] = {}
    pq = [(0.0, start)]
    while pq:
        d, node = heapq.heappop(pq)
        if d > dist.get(node, math.inf):
            continue
        if node == dest:
            break
        for edge_id, nbr in building.adjacency[node]:
            c = costs.get(edge_id)
            if c is None:
                continue
            nd = d + c
            if nd < dist.get(nbr, math.inf):
                dist[nbr] = nd
                prev[nbr] = (node, edge_id)
                heapq.heappush(pq, (nd, nbr))
    if dest not in dist:
        return None, None, None
    nodes, edges = [dest], []
    while nodes[-1] != start:
        p, eid = prev[nodes[-1]]
        nodes.append(p)
        edges.append(eid)
    return list(reversed(nodes)), list(reversed(edges)), dist[dest]


def _steps(building: Building, nodes: list[str]) -> list[dict]:
    steps = []
    for a, b in zip(nodes, nodes[1:]):
        na, nb = building.nodes[a], building.nodes[b]
        dx, dy, dz = nb.x - na.x, nb.y - na.y, nb.z - na.z
        flat = math.hypot(dx, dy)
        bearing = (math.degrees(math.atan2(dx, dy)) + 360) % 360
        if nb.floor_id != na.floor_id:
            instruction = f"Take stairs {'up' if dz > 0 else 'down'} to {nb.label}"
        else:
            instruction = f"Proceed {flat:.0f} m to {nb.label}"
        steps.append({"instruction": instruction, "to_node": b,
                      "waypoint": building.node_position(b),
                      "distance_m": round(flat if flat else abs(dz), 1),
                      "bearing_degrees": round(bearing, 1)})
    return steps


def _route_dict(building, route_id, start, dest, nodes, edge_ids, cost, hazards):
    polyline = [building.node_position(n) for n in nodes]
    distance = round(sum(building.edges[e].distance_m for e in edge_ids), 1)
    return {"route_id": route_id, "status": "candidate", "start_node": start,
            "destination_node": dest, "nodes": nodes, "edge_ids": edge_ids,
            "polyline": polyline, "steps": _steps(building, nodes),
            "total_distance_m": distance, "total_cost": round(cost, 1),
            "hazards_considered": [h["hazard_id"] for h in hazards],
            "assumptions": list(BASE_ASSUMPTIONS),
            "requires_command_approval": True, "unreachable_reason": None,
            "alternate": None}


def _unreachable(route_id, start, dest, hazards):
    blocking = [h["hazard_id"] for h in hazards if h.get("verified")]
    return {"route_id": route_id, "status": "unreachable", "start_node": start,
            "destination_node": dest, "nodes": [], "edge_ids": [], "polyline": [],
            "steps": [], "total_distance_m": 0.0, "total_cost": 0.0,
            "hazards_considered": [h["hazard_id"] for h in hazards],
            "assumptions": list(BASE_ASSUMPTIONS), "requires_command_approval": True,
            "unreachable_reason": ("No traversable path; blocking hazards: "
                                   f"{blocking or 'graph disconnection'}"),
            "alternate": None}


def compute_route(building: Building, start_node: str, destination_node: str,
                  hazards=(), risk: dict | None = None, weights: dict | None = None,
                  route_id: str = "ROUTE_001", include_alternate: bool = True) -> dict:
    hazards = list(hazards)
    costs = edge_costs(building, hazards, risk, weights)
    nodes, edge_ids, cost = _dijkstra(building, costs, start_node, destination_node)
    if nodes is None:
        return _unreachable(route_id, start_node, destination_node, hazards)
    route = _route_dict(building, route_id, start_node, destination_node,
                        nodes, edge_ids, cost, hazards)
    if include_alternate:
        penalized = dict(costs)
        for eid in edge_ids:
            if penalized[eid] is not None:
                penalized[eid] *= 3.0
        alt_nodes, alt_edges, alt_cost = _dijkstra(building, penalized,
                                                   start_node, destination_node)
        if alt_nodes and alt_nodes != nodes:
            # recost the alternate path with the true (unpenalized) costs
            true_cost = sum(costs[e] for e in alt_edges)
            route["alternate"] = _route_dict(building, route_id + "_ALT", start_node,
                                             destination_node, alt_nodes, alt_edges,
                                             true_cost, hazards)
    return route


def nearest_exit_route(building: Building, from_node: str, hazards=(),
                       risk: dict | None = None, weights: dict | None = None,
                       route_id: str = "EVAC_001") -> dict:
    best = None
    for exit_node in building.entrance_nodes():
        r = compute_route(building, from_node, exit_node, hazards, risk, weights,
                          route_id=route_id, include_alternate=False)
        if r["status"] == "candidate" and (best is None or r["total_cost"] < best["total_cost"]):
            best = r
    return best or _unreachable(route_id, from_node, "any_exit", list(hazards))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_routing.py -v`
Expected: all 11 PASS.

- [ ] **Step 5: Commit**

```bash
git add sentinel_engine/routing.py sentinel_engine/tests/test_routing.py
git commit -m "feat: hazard-aware Dijkstra routing with polylines, guidance steps, alternates"
```

---

### Task 4: Fire-spread simulator and Monte Carlo predictor

**Files:**
- Create: `sentinel_engine/spread.py`
- Test: `sentinel_engine/tests/test_spread.py`

**Interfaces:**
- Consumes: `Building` (Task 1) — only `.nodes`, `.edges`, `.adjacency`, so any Building-shaped object works (random buildings in Task 5 reuse the `Building` class).
- Produces:
  - `EDGE_OPENNESS = {"corridor": 0.9, "doorway": 0.5, "exterior_door": 0.3, "stairs": 0.15, "elevator": 0.05}`
  - `TICK_SECONDS = 30`
  - `SpreadSimulator(building, base_rate=0.35, rng=None)` with `rollout(fire_nodes, ticks) -> set[str]` (all nodes that were ever burning, ignition sources included) and `smoke_front(fire_nodes) -> set[str]` (fire nodes + their graph neighbors).
  - `MonteCarloPredictor(building, base_rate=0.35)` with `predict(fire_nodes, horizon_minutes=10, n_rollouts=300, seed=0) -> dict[str, float]` (per-node ignition probability; deterministic for a given seed).
  - `node_features(building, node_id, fire_nodes, smoke_nodes) -> list[float]` — 6 node-identity-free features: `[hops_to_fire, meters_to_fire, same_floor_as_nearest_fire, min_openness_on_path, degree, in_smoke]`; unreachable-from-fire nodes get `hops=99`, `meters=999.0`, `same_floor=0`, `openness=0`.
  - `FEATURE_NAMES` list of the 6 names (for documentation).
  - `SurrogatePredictor` is added in Task 5 — not here.

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_spread.py`:

```python
import random

import pytest
from sentinel_engine.building import Building
from sentinel_engine.spread import (MonteCarloPredictor, SpreadSimulator,
                                    node_features)


@pytest.fixture(scope="module")
def building():
    return Building.load()


def test_rollout_only_spreads_along_edges(building):
    sim = SpreadSimulator(building, rng=random.Random(0))
    burned = sim.rollout({"F2_CORRIDOR_EAST"}, ticks=3)
    # after 3 ticks fire can be at most 3 hops away
    for node in burned:
        feats = node_features(building, node, {"F2_CORRIDOR_EAST"}, set())
        assert feats[0] <= 3


def test_ignition_sources_always_burned(building):
    sim = SpreadSimulator(building, rng=random.Random(1))
    assert "F2_CORRIDOR_EAST" in sim.rollout({"F2_CORRIDOR_EAST"}, ticks=1)


def test_mc_risk_decreases_with_distance(building):
    mc = MonteCarloPredictor(building)
    risk = mc.predict({"F2_CORRIDOR_EAST"}, horizon_minutes=5, n_rollouts=200, seed=0)
    assert risk["F2_CORRIDOR_EAST"] == 1.0
    assert risk["F2_CORRIDOR_CENTER"] > risk["B_MAKERSPACE"]


def test_mc_deterministic_for_seed(building):
    mc = MonteCarloPredictor(building)
    a = mc.predict({"F2_CORRIDOR_EAST"}, n_rollouts=50, seed=7)
    b = mc.predict({"F2_CORRIDOR_EAST"}, n_rollouts=50, seed=7)
    assert a == b


def test_smoke_front_is_one_hop(building):
    sim = SpreadSimulator(building)
    smoke = sim.smoke_front({"F2_CORRIDOR_EAST"})
    assert "F2_STUDIO_220" in smoke and "F2_CORRIDOR_CENTER" in smoke
    assert "F2_CORRIDOR_WEST" not in smoke


def test_node_features_shape_and_unreachable(building):
    feats = node_features(building, "F2_CORRIDOR_CENTER", {"F2_CORRIDOR_EAST"}, set())
    assert len(feats) == 6
    assert feats[0] == 1  # one hop
    assert feats[2] == 1.0  # same floor
    none_reachable = node_features(building, "F2_CORRIDOR_CENTER", set(), set())
    assert none_reachable[0] == 99
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_spread.py -v`
Expected: FAIL with "No module named 'sentinel_engine.spread'".

- [ ] **Step 3: Implement `spread.py`**

```python
"""Simulated graph-based fire spread + predictors. Plausible dynamics, NOT real
fire physics; everything produced here is labeled simulated."""
from __future__ import annotations

import math
import random
from collections import deque

from .building import Building

EDGE_OPENNESS = {"corridor": 0.9, "doorway": 0.5, "exterior_door": 0.3,
                 "stairs": 0.15, "elevator": 0.05}
TICK_SECONDS = 30
FEATURE_NAMES = ["hops_to_fire", "meters_to_fire", "same_floor_as_nearest_fire",
                 "min_openness_on_path", "degree", "in_smoke"]


class SpreadSimulator:
    def __init__(self, building: Building, base_rate: float = 0.35,
                 rng: random.Random | None = None):
        self.building = building
        self.base_rate = base_rate
        self.rng = rng or random.Random()

    def _spread_prob(self, edge_id: str) -> float:
        edge = self.building.edges[edge_id]
        openness = EDGE_OPENNESS[edge.edge_type]
        distance_factor = max(1.0, edge.distance_m / 10.0)
        return min(0.95, self.base_rate * openness / distance_factor)

    def rollout(self, fire_nodes: set[str], ticks: int) -> set[str]:
        burning = set(fire_nodes)
        for _ in range(ticks):
            new = set()
            for node in burning:
                for edge_id, nbr in self.building.adjacency[node]:
                    if nbr not in burning and self.rng.random() < self._spread_prob(edge_id):
                        new.add(nbr)
            burning |= new
        return burning

    def smoke_front(self, fire_nodes: set[str]) -> set[str]:
        smoke = set(fire_nodes)
        for node in fire_nodes:
            smoke.update(nbr for _, nbr in self.building.adjacency[node])
        return smoke


class MonteCarloPredictor:
    method_name = "monte_carlo_simulated"

    def __init__(self, building: Building, base_rate: float = 0.35):
        self.building = building
        self.base_rate = base_rate

    def predict(self, fire_nodes: set[str], horizon_minutes: int = 10,
                n_rollouts: int = 300, seed: int = 0) -> dict[str, float]:
        fire_nodes = set(fire_nodes)
        if not fire_nodes:
            return {n: 0.0 for n in self.building.nodes}
        ticks = max(1, int(horizon_minutes * 60 / TICK_SECONDS))
        counts = {n: 0 for n in self.building.nodes}
        for i in range(n_rollouts):
            sim = SpreadSimulator(self.building, self.base_rate, random.Random(seed + i))
            for node in sim.rollout(fire_nodes, ticks):
                counts[node] += 1
        return {n: round(c / n_rollouts, 4) for n, c in counts.items()}


def node_features(building: Building, node_id: str, fire_nodes: set[str],
                  smoke_nodes: set[str]) -> list[float]:
    degree = float(len(building.adjacency[node_id]))
    in_smoke = 1.0 if node_id in smoke_nodes else 0.0
    if not fire_nodes:
        return [99.0, 999.0, 0.0, 0.0, degree, in_smoke]
    # BFS from node toward nearest fire, tracking meters and min openness on path
    queue = deque([(node_id, 0, 0.0, 1.0)])
    seen = {node_id}
    while queue:
        current, hops, meters, min_open = queue.popleft()
        if current in fire_nodes:
            same_floor = 1.0 if building.nodes[current].floor_id == building.nodes[node_id].floor_id else 0.0
            return [float(hops), round(meters, 1), same_floor, round(min_open, 3),
                    degree, in_smoke]
        for edge_id, nbr in building.adjacency[current]:
            if nbr not in seen:
                seen.add(nbr)
                edge = building.edges[edge_id]
                queue.append((nbr, hops + 1, meters + edge.distance_m,
                              min(min_open, EDGE_OPENNESS[edge.edge_type])))
    return [99.0, 999.0, 0.0, 0.0, degree, in_smoke]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_spread.py -v`
Expected: all 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add sentinel_engine/spread.py sentinel_engine/tests/test_spread.py
git commit -m "feat: simulated fire-spread simulator, Monte Carlo predictor, node features"
```

---

### Task 5: Random buildings, surrogate training, `SurrogatePredictor`

**Files:**
- Create: `sentinel_engine/train_spread_model.py`
- Modify: `sentinel_engine/spread.py` (append `SurrogatePredictor`)
- Create (artifact, by running training): `sentinel_engine/data/spread_model.joblib`
- Test: `sentinel_engine/tests/test_surrogate.py`

**Interfaces:**
- Consumes: `Building`, `SpreadSimulator`, `MonteCarloPredictor`, `node_features`, `TICK_SECONDS` (Task 4).
- Produces:
  - `train_spread_model.random_building(rng: random.Random) -> Building` — randomized synthetic building (2–4 floors, varied widths, 2 stairwells, 2–4 rooms/floor), same schema as Jacobs; node ids never seen by the model (features are identity-free).
  - `train_spread_model.generate_dataset(buildings, rng, rollouts_per_building=3, horizon_minutes=10) -> tuple[list[list[float]], list[int]]` — X features at t=0, y = node ignited within horizon in that rollout.
  - `train_spread_model.main(n_buildings=200, seed=0)` — trains `GradientBoostingClassifier`, prints held-out AUC on random buildings AND on Jacobs Hall (never in training), saves `{"model": clf, "feature_names": FEATURE_NAMES, "horizon_minutes": 10, "trained_on": "randomized synthetic buildings (simulated dynamics)", "jacobs_in_training": False}` to `sentinel_engine/data/spread_model.joblib`.
  - `spread.SurrogatePredictor.load(path=None) -> SurrogatePredictor | None` (None if checkpoint missing — callers fall back to Monte Carlo); instance has `method_name = "surrogate_ml_simulated"`, `horizon_minutes`, and `predict(building, fire_nodes, smoke_nodes=None) -> dict[str, float]`. NOTE: unlike Monte Carlo, the surrogate takes `building` at predict time (it is building-agnostic).

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_surrogate.py`:

```python
import random

import pytest
from sentinel_engine.building import Building
from sentinel_engine.spread import MonteCarloPredictor, SurrogatePredictor
from sentinel_engine.train_spread_model import generate_dataset, random_building


def test_random_building_valid_graph():
    b = random_building(random.Random(42))
    assert len(b.floors) >= 2
    for e in b.edges.values():
        assert e.from_node in b.nodes and e.to_node in b.nodes
        fa, fb = b.nodes[e.from_node].floor_id, b.nodes[e.to_node].floor_id
        if fa != fb:
            assert e.edge_type in ("stairs", "elevator")


def test_generate_dataset_shapes():
    rng = random.Random(0)
    buildings = [random_building(rng) for _ in range(3)]
    X, y = generate_dataset(buildings, rng, rollouts_per_building=2)
    assert len(X) == len(y) > 0
    assert all(len(row) == 6 for row in X)
    assert set(y) <= {0, 1}


def test_surrogate_checkpoint_exists_and_predicts():
    sp = SurrogatePredictor.load()
    assert sp is not None, "run train_spread_model first; checkpoint must be committed"
    building = Building.load()
    risk = sp.predict(building, {"F2_CORRIDOR_EAST"})
    assert set(risk) == set(building.nodes)
    assert all(0.0 <= v <= 1.0 for v in risk.values())
    assert risk["F2_CORRIDOR_CENTER"] > risk["B_MAKERSPACE"]


def test_surrogate_agrees_with_monte_carlo_on_heldout_jacobs():
    """Headline validation: AUC vs simulated ground truth on a building the
    model never saw in training."""
    from sklearn.metrics import roc_auc_score
    from sentinel_engine.spread import SpreadSimulator

    building = Building.load()
    sp = SurrogatePredictor.load()
    preds = sp.predict(building, {"F2_CORRIDOR_EAST"})
    labels, scores = [], []
    for i in range(40):
        sim = SpreadSimulator(building, rng=random.Random(1000 + i))
        burned = sim.rollout({"F2_CORRIDOR_EAST"}, ticks=20)
        for node in building.nodes:
            labels.append(1 if node in burned else 0)
            scores.append(preds[node])
    assert roc_auc_score(labels, scores) >= 0.75


def test_missing_checkpoint_returns_none(tmp_path):
    assert SurrogatePredictor.load(tmp_path / "nope.joblib") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_surrogate.py -v`
Expected: FAIL with "No module named 'sentinel_engine.train_spread_model'".

- [ ] **Step 3: Implement — append `SurrogatePredictor` to `spread.py`**

Append to `sentinel_engine/spread.py`:

```python
SURROGATE_PATH = __import__("pathlib").Path(__file__).parent / "data" / "spread_model.joblib"


class SurrogatePredictor:
    """ML surrogate of the simulated spread dynamics. Trained ONLY on randomized
    synthetic buildings; building-agnostic via identity-free node features."""

    method_name = "surrogate_ml_simulated"

    def __init__(self, model, horizon_minutes: int):
        self.model = model
        self.horizon_minutes = horizon_minutes

    @classmethod
    def load(cls, path=None) -> "SurrogatePredictor | None":
        import joblib
        p = path or SURROGATE_PATH
        try:
            payload = joblib.load(p)
        except FileNotFoundError:
            return None
        return cls(payload["model"], payload["horizon_minutes"])

    def predict(self, building: Building, fire_nodes: set[str],
                smoke_nodes: set[str] | None = None) -> dict[str, float]:
        fire_nodes = set(fire_nodes)
        if not fire_nodes:
            return {n: 0.0 for n in building.nodes}
        smoke_nodes = smoke_nodes or SpreadSimulator(building).smoke_front(fire_nodes)
        node_ids = list(building.nodes)
        X = [node_features(building, n, fire_nodes, smoke_nodes) for n in node_ids]
        probs = self.model.predict_proba(X)[:, 1]
        risk = {n: round(float(p), 4) for n, p in zip(node_ids, probs)}
        for n in fire_nodes:
            risk[n] = 1.0
        return risk
```

- [ ] **Step 4: Implement `train_spread_model.py`**

```python
"""Trains the fire-spread surrogate on randomized synthetic buildings.
Jacobs Hall is NEVER in the training set; it is the held-out validation building.
Ground-truth dynamics are our simulator's (simulated, plausible-physics)."""
from __future__ import annotations

import random

from .building import Building
from .spread import (FEATURE_NAMES, SURROGATE_PATH, SpreadSimulator,
                     TICK_SECONDS, node_features)


def random_building(rng: random.Random) -> Building:
    n_floors = rng.randint(2, 4)
    width = rng.uniform(25, 50)
    depth = rng.uniform(12, 25)
    floors, nodes, edges = [], [], []

    def add_node(node_id, floor_id, node_type, x, y, z):
        nodes.append({"node_id": node_id, "floor_id": floor_id, "node_type": node_type,
                      "label": node_id, "x": round(x, 1), "y": round(y, 1), "z": round(z, 1)})

    def add_edge(a, b, edge_type):
        na = next(n for n in nodes if n["node_id"] == a)
        nb = next(n for n in nodes if n["node_id"] == b)
        d = ((na["x"] - nb["x"]) ** 2 + (na["y"] - nb["y"]) ** 2
             + (na["z"] - nb["z"]) ** 2) ** 0.5
        edges.append({"edge_id": f"E{len(edges):03d}", "from_node": a, "to_node": b,
                      "distance_m": round(max(d, 1.0), 1), "edge_type": edge_type})

    for i in range(n_floors):
        fid, z = f"L{i}", i * 4.0
        floors.append({"floor_id": fid, "name": fid, "elevation_m": z})
        mid = depth / 2
        add_node(f"{fid}_S0", fid, "stairs", width * 0.1, mid, z)
        add_node(f"{fid}_S1", fid, "stairs", width * 0.9, mid, z)
        corridor_ids = []
        for j in range(3):
            cid = f"{fid}_C{j}"
            corridor_ids.append(cid)
            add_node(cid, fid, "corridor", width * (0.25 + 0.25 * j), mid, z)
        for a, b in zip(corridor_ids, corridor_ids[1:]):
            add_edge(a, b, "corridor")
        add_edge(f"{fid}_S0", corridor_ids[0], "doorway")
        add_edge(f"{fid}_S1", corridor_ids[-1], "doorway")
        for r in range(rng.randint(2, 4)):
            rid = f"{fid}_R{r}"
            add_node(rid, fid, "room", rng.uniform(2, width - 2),
                     mid + rng.choice([-1, 1]) * depth * 0.3, z)
            add_edge(rid, rng.choice(corridor_ids), "doorway")
    for i in range(n_floors - 1):
        add_edge(f"L{i}_S0", f"L{i+1}_S0", "stairs")
        add_edge(f"L{i}_S1", f"L{i+1}_S1", "stairs")

    return Building({"building_id": f"synthetic_{rng.randint(0, 10**9)}",
                     "coordinate_frame": "SYNTHETIC_LOCAL", "provenance": "simulated",
                     "source_note": "randomized synthetic training building",
                     "floors": floors, "nodes": nodes, "edges": edges})


def generate_dataset(buildings, rng: random.Random, rollouts_per_building: int = 3,
                     horizon_minutes: int = 10):
    ticks = int(horizon_minutes * 60 / TICK_SECONDS)
    X, y = [], []
    for b in buildings:
        node_ids = list(b.nodes)
        for _ in range(rollouts_per_building):
            ignition = {rng.choice(node_ids)}
            sim = SpreadSimulator(b, rng=random.Random(rng.randint(0, 10**9)))
            smoke = sim.smoke_front(ignition)
            burned = sim.rollout(ignition, ticks)
            for n in node_ids:
                X.append(node_features(b, n, ignition, smoke))
                y.append(1 if n in burned else 0)
    return X, y


def main(n_buildings: int = 200, seed: int = 0):
    import joblib
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.metrics import roc_auc_score

    rng = random.Random(seed)
    buildings = [random_building(rng) for _ in range(n_buildings)]
    split = int(n_buildings * 0.85)
    X_train, y_train = generate_dataset(buildings[:split], rng)
    X_val, y_val = generate_dataset(buildings[split:], rng)

    clf = GradientBoostingClassifier(random_state=seed)
    clf.fit(X_train, y_train)
    val_auc = roc_auc_score(y_val, clf.predict_proba(X_val)[:, 1])

    jacobs = Building.load()
    X_j, y_j = generate_dataset([jacobs], random.Random(seed + 1),
                                rollouts_per_building=30)
    jacobs_auc = roc_auc_score(y_j, clf.predict_proba(X_j)[:, 1])

    SURROGATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": clf, "feature_names": FEATURE_NAMES, "horizon_minutes": 10,
                 "trained_on": "randomized synthetic buildings (simulated dynamics)",
                 "jacobs_in_training": False}, SURROGATE_PATH)
    print(f"samples: train={len(X_train)} val={len(X_val)}")
    print(f"held-out random-building AUC: {val_auc:.3f}")
    print(f"held-out JACOBS HALL AUC (never in training): {jacobs_auc:.3f}")
    print(f"saved {SURROGATE_PATH}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 5: Run training**

Run: `.venv/bin/python -m sentinel_engine.train_spread_model`
Expected: prints train/val sample counts, both AUCs (expect ≥ 0.80), and the saved path. **Record the printed AUCs — INTEGRATION.md (Task 10) must quote the real numbers.** If Jacobs AUC < 0.75, increase `n_buildings` to 400 and rerun once; if still < 0.75, STOP and report — do not weaken the test.

- [ ] **Step 6: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_surrogate.py sentinel_engine/tests/test_spread.py -v`
Expected: all PASS (checkpoint now exists).

- [ ] **Step 7: Commit (checkpoint included)**

```bash
git add sentinel_engine/spread.py sentinel_engine/train_spread_model.py \
        sentinel_engine/data/spread_model.joblib sentinel_engine/tests/test_surrogate.py
git commit -m "feat: train spread surrogate on randomized buildings, validate on held-out Jacobs"
```

---

### Task 6: Civilian distress triage

**Files:**
- Create: `sentinel_engine/triage.py`
- Test: `sentinel_engine/tests/test_triage.py`

**Interfaces:**
- Consumes: `Building.resolve_location` (Task 1).
- Produces:
  - `extract_report(text: str, building: Building) -> dict` — `{raw_text, location (resolve_location dict | None), people_count (int), mobility_limited (bool), unconscious (bool), smoke_reported (bool), fire_reported (bool), exits_blocked (bool), unknowns (list[str])}`. `unknowns` lists field names that could not be determined (always includes `"location"` when unresolved; includes `"people_count"` when not stated — count then defaults to 1; "my friend"/"a friend" with no number implies 2).
  - `prioritize(report: dict, risk: dict | None = None) -> dict` — `{priority ("urgent_review"|"priority_review"|"standard_review"), score (int), reported_conditions (list[str]), reason (str), requires_responder_review: True, flags (list[str])}`. Scoring: fire_reported +3, smoke_reported +2, mobility_limited or unconscious +3, exits_blocked +2, people_count > 1 +1, resolved location with `risk[node] >= 0.5` +2. Thresholds: score ≥ 6 urgent, ≥ 3 priority, else standard. Unknown location NEVER reduces score; it appends flag `"location unresolved — needs contact"`.

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_triage.py`:

```python
import pytest
from sentinel_engine.building import Building
from sentinel_engine.triage import extract_report, prioritize


@pytest.fixture(scope="module")
def building():
    return Building.load()


def test_demo_report_extraction(building):
    r = extract_report("I'm in Studio 210 on the second floor. "
                       "There's smoke outside and my friend can't walk.", building)
    assert r["location"]["node_id"] == "F2_STUDIO_210"
    assert r["smoke_reported"] is True
    assert r["mobility_limited"] is True
    assert r["people_count"] == 2
    assert "location" not in r["unknowns"]


def test_unknowns_stay_unknown(building):
    r = extract_report("help", building)
    assert r["location"] is None
    assert "location" in r["unknowns"]
    assert "people_count" in r["unknowns"]
    assert r["people_count"] == 1
    assert r["fire_reported"] is False


def test_count_words(building):
    r = extract_report("There are three of us and one person is unconscious", building)
    assert r["people_count"] == 3
    assert r["unconscious"] is True


def test_priority_urgent_for_demo_report(building):
    r = extract_report("I'm in Studio 210 on the second floor. "
                       "There's smoke outside and my friend can't walk.", building)
    p = prioritize(r)
    assert p["priority"] == "urgent_review"
    assert p["requires_responder_review"] is True
    assert "smoke_nearby" in p["reported_conditions"]
    assert "mobility_limited" in p["reported_conditions"]
    assert len(p["reason"]) > 10


def test_unknown_location_never_deprioritizes(building):
    vague = prioritize(extract_report("There's fire and I can't walk!", building))
    located = prioritize(extract_report(
        "There's fire and I can't walk! I'm in Studio 310 on the third floor", building))
    assert vague["score"] >= located["score"] - 2  # risk bonus is the only allowed diff
    assert "location unresolved — needs contact" in vague["flags"]
    assert vague["priority"] == "urgent_review"


def test_predicted_risk_raises_priority(building):
    r = extract_report("I'm in Studio 220 on the second floor, there is smoke", building)
    base = prioritize(r)
    risky = prioritize(r, risk={"F2_STUDIO_220": 0.8})
    assert risky["score"] == base["score"] + 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_triage.py -v`
Expected: FAIL with "No module named 'sentinel_engine.triage'".

- [ ] **Step 3: Implement `triage.py`**

```python
"""Deterministic distress-report extraction and dispatch-review prioritization.
Produces review priorities for a human incident commander — not medical triage."""
from __future__ import annotations

import re

from .building import Building

COUNT_WORDS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
               "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
MOBILITY_PATTERNS = ["can't walk", "cannot walk", "can not walk", "wheelchair",
                     "broken leg", "can't move", "cannot move", "injured leg"]
UNCONSCIOUS_PATTERNS = ["unconscious", "passed out", "not responding", "not breathing"]
BLOCKED_PATTERNS = ["can't get out", "cannot get out", "door is blocked", "blocked",
                    "trapped", "can't find the stairs"]


def extract_report(text: str, building: Building) -> dict:
    t = text.lower()
    unknowns: list[str] = []

    location = building.resolve_location(text)
    if location is None:
        unknowns.append("location")

    people_count = 1
    m = re.search(r"\b(\d+|" + "|".join(COUNT_WORDS) + r")\s+of us\b", t) or \
        re.search(r"\b(\d+|" + "|".join(COUNT_WORDS) + r")\s+(?:people|persons)\b", t)
    if m:
        token = m.group(1)
        people_count = COUNT_WORDS.get(token) or int(token)
    elif "friend" in t:
        people_count = 2
    else:
        unknowns.append("people_count")

    return {"raw_text": text, "location": location, "people_count": people_count,
            "mobility_limited": any(p in t for p in MOBILITY_PATTERNS),
            "unconscious": any(p in t for p in UNCONSCIOUS_PATTERNS),
            "smoke_reported": "smoke" in t,
            "fire_reported": bool(re.search(r"\bfire\b|flames", t)),
            "exits_blocked": any(p in t for p in BLOCKED_PATTERNS),
            "unknowns": unknowns}


def prioritize(report: dict, risk: dict | None = None) -> dict:
    risk = risk or {}
    score = 0
    conditions: list[str] = []
    flags: list[str] = []
    reasons: list[str] = []

    if report["fire_reported"]:
        score += 3
        conditions.append("fire_nearby")
        reasons.append("occupant reports fire nearby")
    if report["smoke_reported"]:
        score += 2
        conditions.append("smoke_nearby")
        reasons.append("occupant reports smoke nearby")
    if report["mobility_limited"] or report["unconscious"]:
        score += 3
        conditions.append("mobility_limited" if report["mobility_limited"] else "unconscious_person")
        reasons.append("occupant or companion cannot self-evacuate")
    if report["exits_blocked"]:
        score += 2
        conditions.append("exit_blocked")
        reasons.append("occupant reports blocked egress")
    if report["people_count"] > 1:
        score += 1
        reasons.append(f"{report['people_count']} people reported together")
    if report["location"] and risk.get(report["location"]["node_id"], 0.0) >= 0.5:
        score += 2
        conditions.append("predicted_fire_spread_nearby")
        reasons.append("simulated model predicts fire spread toward reported location")

    if report["location"] is None:
        flags.append("location unresolved — needs contact")
    elif report["location"].get("conflict"):
        flags.append(report["location"]["conflict"])

    priority = ("urgent_review" if score >= 6
                else "priority_review" if score >= 3 else "standard_review")
    return {"priority": priority, "score": score, "reported_conditions": conditions,
            "reason": "; ".join(reasons) or "no specific risk factors reported",
            "requires_responder_review": True, "flags": flags}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_triage.py -v`
Expected: all 6 PASS.

- [ ] **Step 5: Commit**

```bash
git add sentinel_engine/triage.py sentinel_engine/tests/test_triage.py
git commit -m "feat: deterministic distress extraction and dispatch-review prioritization"
```

---

### Task 7: Civilian advisories

**Files:**
- Create: `sentinel_engine/advisories.py`
- Test: `sentinel_engine/tests/test_advisories.py`

**Interfaces:**
- Consumes: `Building` (Task 1), entity dict shape (Task 2), route dict / `nearest_exit_route` (Task 3).
- Produces: `compose_advisory(civilian: dict, hazards: list[dict], evac_route: dict | None, building: Building, responder_en_route: bool = False) -> dict` — returns `{civilian_id, message (str), requires_command_approval: True, generated_at, based_on: {hazard_ids, route_id, responder_en_route}}`. Message rules: opens with hazard summary for the civilian's floor (types joined, e.g. "Smoke has been reported on your floor (F2).") or "No hazards are currently reported on your floor (F2)." when none; if `evac_route` is a candidate, adds "Recommended evacuation (pending command approval): " + " Then ".join(step instructions) + " You will exit at {last node label}."; if route is None/unreachable, adds "Please remain where you are; responders have your location report."; if `responder_en_route`, adds "A responder team has been assigned to review your situation."; never contains the word "safe".

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_advisories.py`:

```python
import pytest
from sentinel_engine.advisories import compose_advisory
from sentinel_engine.building import Building
from sentinel_engine.routing import nearest_exit_route


@pytest.fixture(scope="module")
def building():
    return Building.load()


def _civilian():
    return {"entity_id": "CIV_001", "entity_type": "civilian",
            "graph_node_id": "F2_STUDIO_210",
            "world_position": {"x": 12.0, "y": 16.0, "z": 4.0, "floor_id": "F2",
                               "coordinate_frame": "JACOBS_LOCAL"}}


def _smoke():
    return {"hazard_id": "HAZ_001", "hazard_type": "smoke",
            "node_id": "F2_CORRIDOR_EAST", "edge_id": None, "verified": False,
            "source": "civilian_report", "description": ""}


def test_advisory_with_route(building):
    route = nearest_exit_route(building, "F2_STUDIO_210", hazards=[_smoke()])
    adv = compose_advisory(_civilian(), [_smoke()], route, building,
                           responder_en_route=True)
    assert adv["civilian_id"] == "CIV_001"
    assert adv["requires_command_approval"] is True
    assert "Smoke has been reported on your floor (F2)." in adv["message"]
    assert "Recommended evacuation (pending command approval):" in adv["message"]
    assert "responder team" in adv["message"]
    assert "safe" not in adv["message"].lower()
    assert adv["based_on"]["route_id"] == route["route_id"]


def test_advisory_without_route_says_remain(building):
    adv = compose_advisory(_civilian(), [], None, building)
    assert "No hazards are currently reported on your floor (F2)." in adv["message"]
    assert "remain where you are" in adv["message"]


def test_hazards_on_other_floor_not_included(building):
    other = dict(_smoke(), node_id="F3_CORRIDOR_EAST")
    adv = compose_advisory(_civilian(), [other], None, building)
    assert "No hazards are currently reported on your floor" in adv["message"]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_advisories.py -v`
Expected: FAIL with "No module named 'sentinel_engine.advisories'".

- [ ] **Step 3: Implement `advisories.py`**

```python
"""Drafts civilian advisory messages. Drafts only — the incident commander
approves and sends; nothing here promises safety."""
from __future__ import annotations

from datetime import datetime, timezone

from .building import Building


def _floor_of(civilian: dict) -> str | None:
    wp = civilian.get("world_position") or {}
    return wp.get("floor_id")


def compose_advisory(civilian: dict, hazards: list[dict], evac_route: dict | None,
                     building: Building, responder_en_route: bool = False) -> dict:
    floor = _floor_of(civilian)
    on_floor = [h for h in hazards
                if h.get("node_id") and building.nodes[h["node_id"]].floor_id == floor]

    parts: list[str] = []
    if on_floor:
        types = sorted({h["hazard_type"].capitalize() for h in on_floor})
        parts.append(f"{' and '.join(types)} has been reported on your floor ({floor}).")
    else:
        parts.append(f"No hazards are currently reported on your floor ({floor}).")

    if evac_route and evac_route["status"] == "candidate":
        instructions = " Then ".join(s["instruction"] for s in evac_route["steps"])
        exit_label = building.nodes[evac_route["nodes"][-1]].label
        parts.append("Recommended evacuation (pending command approval): "
                     f"{instructions}. You will exit at {exit_label}.")
    else:
        parts.append("Please remain where you are; responders have your location report.")

    if responder_en_route:
        parts.append("A responder team has been assigned to review your situation.")

    return {"civilian_id": civilian["entity_id"], "message": " ".join(parts),
            "requires_command_approval": True,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "based_on": {"hazard_ids": [h["hazard_id"] for h in on_floor],
                         "route_id": evac_route["route_id"] if evac_route else None,
                         "responder_en_route": responder_en_route}}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_advisories.py -v`
Expected: all 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add sentinel_engine/advisories.py sentinel_engine/tests/test_advisories.py
git commit -m "feat: civilian advisory drafting with command-approval gating"
```

---

### Task 8: Simulated perception feed

**Files:**
- Create: `sentinel_engine/perception.py`
- Test: `sentinel_engine/tests/test_perception.py`

**Interfaces:**
- Consumes: coordinate conventions only.
- Produces: `scenario_observations() -> list[dict]` — scripted stand-in for the descoped CV layer. Each observation: `{observation_id, type ("person"|"fire"|"smoke"), world_position {x,y,z,floor_id,coordinate_frame}, graph_node_id, camera_id, confidence, source: "simulated_camera", position_status: "simulated", provenance: "simulated", timestamp}`. The scripted list has exactly: OBS_001 person at F2_CORRIDOR_EAST (28,10,4) CAM_F2_EAST conf 0.94; OBS_002 person at F1_CORRIDOR_CENTER (20,10,0) CAM_F1_LOBBY conf 0.88; OBS_003 smoke at F2_CORRIDOR_EAST (28,10,4) CAM_F2_EAST conf 0.81; OBS_004 fire at F2_CORRIDOR_EAST (28,10,4) CAM_F2_EAST conf 0.77.

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_perception.py`:

```python
from sentinel_engine.building import Building
from sentinel_engine.perception import scenario_observations


def test_scenario_observations_shape_and_labeling():
    obs = scenario_observations()
    assert len(obs) == 4
    building = Building.load()
    for o in obs:
        assert o["position_status"] == "simulated"
        assert o["provenance"] == "simulated"
        assert o["source"] == "simulated_camera"
        assert o["world_position"]["coordinate_frame"] == "JACOBS_LOCAL"
        assert o["graph_node_id"] in building.nodes
        node = building.nodes[o["graph_node_id"]]
        assert o["world_position"]["floor_id"] == node.floor_id


def test_scenario_includes_fire_and_smoke_on_f2_east():
    obs = scenario_observations()
    types = {o["type"] for o in obs if o["graph_node_id"] == "F2_CORRIDOR_EAST"}
    assert {"person", "smoke", "fire"} <= types
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_perception.py -v`
Expected: FAIL with "No module named 'sentinel_engine.perception'".

- [ ] **Step 3: Implement `perception.py`**

```python
"""Simulated perception feed. Stand-in for a solved CV system: emits
observations already in building coordinates, all labeled simulated. A real
CV pipeline would later POST the same shape to /observations."""
from __future__ import annotations

from datetime import datetime, timezone


def _obs(obs_id, obs_type, node_id, x, y, z, floor_id, camera_id, confidence):
    return {"observation_id": obs_id, "type": obs_type,
            "world_position": {"x": x, "y": y, "z": z, "floor_id": floor_id,
                               "coordinate_frame": "JACOBS_LOCAL"},
            "graph_node_id": node_id, "camera_id": camera_id,
            "confidence": confidence, "source": "simulated_camera",
            "position_status": "simulated", "provenance": "simulated",
            "timestamp": datetime.now(timezone.utc).isoformat()}


def scenario_observations() -> list[dict]:
    return [
        _obs("OBS_001", "person", "F2_CORRIDOR_EAST", 28.0, 10.0, 4.0, "F2",
             "CAM_F2_EAST", 0.94),
        _obs("OBS_002", "person", "F1_CORRIDOR_CENTER", 20.0, 10.0, 0.0, "F1",
             "CAM_F1_LOBBY", 0.88),
        _obs("OBS_003", "smoke", "F2_CORRIDOR_EAST", 28.0, 10.0, 4.0, "F2",
             "CAM_F2_EAST", 0.81),
        _obs("OBS_004", "fire", "F2_CORRIDOR_EAST", 28.0, 10.0, 4.0, "F2",
             "CAM_F2_EAST", 0.77),
    ]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_perception.py -v`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add sentinel_engine/perception.py sentinel_engine/tests/test_perception.py
git commit -m "feat: simulated perception feed (stand-in for descoped CV)"
```

---

### Task 9: FastAPI service

**Files:**
- Create: `sentinel_engine/api.py`
- Test: `sentinel_engine/tests/test_api.py`

**Interfaces:**
- Consumes: everything from Tasks 1–8, exact signatures as defined there.
- Produces: `create_app(building_path=None) -> FastAPI` and module-level `app = create_app()`. App state on `app.state`: `building`, `incident` (IncidentState), `fire_nodes` (set), `predictor` (SurrogatePredictor or None), `mc` (MonteCarloPredictor). Endpoints (all JSON):
  - `GET /health` → `{"status": "ok", "building_id": ..., "surrogate_loaded": bool}`
  - `GET /building` → `building.to_dict()`; `GET /building/graph` → `{"nodes": [...], "edges": [...]}` from the same dict.
  - `GET /spatial/coordinate-system` → `{coordinate_frame, origin_description, axes: {...}, floors: [...], provenance: "simulated"}`
  - `POST /observations` (body = perception observation dict) → ingests: person → `register_entity("detected_person", world_position=..., graph_node_id=..., source="simulated_camera", position_status="simulated")`; fire/smoke → `add_hazard(type, node_id=graph_node_id, verified=False, source="simulated_camera")`, fire also adds node to `fire_nodes`; appends `observation_ingested` event; triggers route recompute. Returns the created entity or hazard.
  - `POST /civilians` `{name?}` → register civilian. `GET /civilians` → list. `POST /civilians/report` `{civilian_id?, text}` → creates civilian if no id; runs `extract_report` + current risk + `prioritize`; stores `report` and `priority` on the entity (and extends entity `flags` with priority flags); if location resolved, updates entity location (node, `source="civilian_report"`, `position_status="reported"`); appends `civilian_report` event; returns `{civilian: entity, report, priority}`.
  - `GET /civilians/{id}/advisory` → computes evacuation route via `nearest_exit_route` from the civilian's `graph_node_id` (404-style error JSON if civilian unknown; advisory with no route if no node), `responder_en_route` = any route in state with `meta.civilian_id == id`; appends `advisory_drafted` event. `GET /advisories` → advisory for every civilian with a known node.
  - `POST /responders` `{responder_id?, name?, graph_node_id?}` → register (source `"responder_report"`, status `"reported"`). `GET /responders` → list. `POST /responders/location` `{responder_id, graph_node_id?, world_position?, text?}` — if `text` given, resolve via `building.resolve_location(text)`; updates location.
  - `GET /responders/{id}/guidance` → finds the stored route with `meta.responder_id == id`; snaps responder to the nearest route node (euclidean on same floor, else route start); returns `{route_id, status, next_steps: steps from that node, destination_node}` or `{"status": "no_active_route"}`.
  - `POST /hazards` `{hazard_type, node_id?, edge_id?, text?, verified?, source?, description?}` — if `text` given and no node/edge, resolve via `resolve_location(text, default_floor)` (body may include `default_floor`); 400 if unresolvable. Fire hazards add node to `fire_nodes`. Triggers recompute. `GET /hazards` → list. `DELETE /hazards/{id}` → remove + recompute.
  - `POST /routes/compute` `{start_node?, responder_id?, destination_node?, civilian_id?, route_id?}` — resolves start from responder's node and destination from civilian's node when ids given (400 error JSON with explicit message if entity has no node); computes with current hazards + risk; stores via `set_route(route, meta={responder_id, civilian_id, request: body})`; appends `route_computed` event; returns route. `GET /routes` → stored routes.
  - `GET /spread/prediction` → `{fire_nodes, horizon_minutes, method, risk, provenance: "simulated"}` — uses surrogate if loaded else Monte Carlo (`method` = predictor's `method_name`); empty `fire_nodes` → all-zero risk, `method: "none"`.
  - `POST /spread/ignite` `{node_id}` → adds node to `fire_nodes` + fire hazard (verified=True, source `"demo_control"`); recompute; returns prediction payload.
  - `POST /rescue/prioritize` → for each civilian with a `priority`: sorted by score desc; each entry `{civilian_id, priority, score, reason, flags, nearest_responder_id, route_status, estimated_cost, requires_command_approval: true}` — nearest responder = lowest `total_cost` candidate route from each responder's node (skip responders without nodes; `route_status: "unreachable"` and `nearest_responder_id: null` if none reach); appends `rescue_prioritized` event; returns `{"recommendations": [...]}`.
  - `GET /incident/state` → `incident.snapshot()`. `GET /incident/events?since=0` → `{"events": events_since(since)}`.
  - Route recompute helper `_recompute_routes(app)` : for each stored route, recompute with same start/dest + current hazards/risk; if node list changed, `set_route` and append `route_updated` event with `{route_id, reason: "hazard_change"}`.
  - Risk helper `_current_risk(app) -> dict`: surrogate predict if loaded else `mc.predict(fire_nodes)`; `{}` if no fire nodes.
  - CORS: `allow_origins=["*"]`, all methods/headers. Errors: FastAPI `HTTPException(status_code=400/404, detail=...)`.

- [ ] **Step 1: Write failing tests**

`sentinel_engine/tests/test_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sentinel_engine.api import create_app


@pytest.fixture
def client():
    return TestClient(create_app())


def test_health(client):
    r = client.get("/health").json()
    assert r["status"] == "ok" and r["building_id"] == "jacobs_hall"


def test_coordinate_system_contract(client):
    r = client.get("/spatial/coordinate-system").json()
    assert r["coordinate_frame"] == "JACOBS_LOCAL"
    assert r["provenance"] == "simulated"
    assert len(r["floors"]) == 4


def test_civilian_report_flow(client):
    r = client.post("/civilians/report", json={
        "text": "I'm in Studio 210 on the second floor. There's smoke outside "
                "and my friend can't walk."}).json()
    assert r["civilian"]["graph_node_id"] == "F2_STUDIO_210"
    assert r["priority"]["priority"] == "urgent_review"
    civs = client.get("/civilians").json()
    assert civs[0]["report"]["smoke_reported"] is True


def test_observation_ingest_person_and_fire(client):
    from sentinel_engine.perception import scenario_observations
    for obs in scenario_observations():
        assert client.post("/observations", json=obs).status_code == 200
    state = client.get("/incident/state").json()
    types = {e["entity_type"] for e in state["entities"]}
    assert "detected_person" in types
    hazard_types = {h["hazard_type"] for h in state["hazards"]}
    assert {"fire", "smoke"} <= hazard_types
    pred = client.get("/spread/prediction").json()
    assert pred["fire_nodes"] == ["F2_CORRIDOR_EAST"]
    assert pred["provenance"] == "simulated"
    assert pred["risk"]["F2_CORRIDOR_EAST"] == 1.0


def test_route_compute_and_hazard_recompute(client):
    client.post("/responders", json={"responder_id": "UNIT_ALPHA",
                                     "graph_node_id": "F1_ENTRANCE_MAIN"})
    rep = client.post("/civilians/report", json={
        "text": "I'm in Studio 210 on the second floor"}).json()
    civ_id = rep["civilian"]["entity_id"]
    route = client.post("/routes/compute", json={
        "responder_id": "UNIT_ALPHA", "civilian_id": civ_id}).json()
    assert route["status"] == "candidate"
    original_nodes = route["nodes"]

    hz = client.post("/hazards", json={
        "hazard_type": "blocked", "text": "west stairwell", "default_floor": "F2",
        "verified": True, "source": "responder_report"})
    assert hz.status_code == 200
    routes = client.get("/routes").json()
    updated = next(r for r in routes if r["route_id"] == route["route_id"])
    assert updated["nodes"] != original_nodes
    events = client.get("/incident/events", params={"since": 0}).json()["events"]
    assert any(e["event_type"] == "route_updated" for e in events)


def test_guidance_for_responder(client):
    client.post("/responders", json={"responder_id": "UNIT_ALPHA",
                                     "graph_node_id": "F1_ENTRANCE_MAIN"})
    rep = client.post("/civilians/report",
                      json={"text": "Studio 310 on the third floor"}).json()
    client.post("/routes/compute", json={"responder_id": "UNIT_ALPHA",
                                         "civilian_id": rep["civilian"]["entity_id"]})
    g = client.get("/responders/UNIT_ALPHA/guidance").json()
    assert g["status"] == "candidate"
    assert g["next_steps"][0]["waypoint"]["coordinate_frame"] == "JACOBS_LOCAL"


def test_advisory_endpoint(client):
    rep = client.post("/civilians/report", json={
        "text": "I'm in Studio 210 on the second floor, smoke outside"}).json()
    adv = client.get(f"/civilians/{rep['civilian']['entity_id']}/advisory").json()
    assert adv["requires_command_approval"] is True
    assert "safe" not in adv["message"].lower()


def test_rescue_prioritize_orders_by_score(client):
    client.post("/responders", json={"responder_id": "UNIT_ALPHA",
                                     "graph_node_id": "F1_ENTRANCE_MAIN"})
    client.post("/civilians/report", json={"text": "I'm in Studio 310 on the third floor"})
    client.post("/civilians/report", json={
        "text": "Fire in Studio 210 on the second floor, I can't walk, "
                "there are three of us"})
    recs = client.post("/rescue/prioritize").json()["recommendations"]
    assert recs[0]["priority"] == "urgent_review"
    assert recs[0]["score"] >= recs[-1]["score"]
    assert recs[0]["nearest_responder_id"] == "UNIT_ALPHA"
    assert recs[0]["requires_command_approval"] is True


def test_unknown_civilian_404(client):
    assert client.get("/civilians/NOPE/advisory").status_code == 404


def test_route_compute_missing_node_400(client):
    client.post("/civilians", json={})  # civilian with no location
    r = client.post("/routes/compute", json={"start_node": "F1_ENTRANCE_MAIN",
                                             "civilian_id": "CIV_001"})
    assert r.status_code == 400


def test_ignite_demo_control(client):
    r = client.post("/spread/ignite", json={"node_id": "F2_CORRIDOR_EAST"}).json()
    assert "F2_CORRIDOR_EAST" in r["fire_nodes"]
    hazards = client.get("/hazards").json()
    assert any(h["hazard_type"] == "fire" and h["verified"] for h in hazards)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_api.py -v`
Expected: FAIL with "No module named 'sentinel_engine.api'".

- [ ] **Step 3: Implement `api.py`**

```python
"""FastAPI adapter over the Sentinel intelligence engine."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .advisories import compose_advisory
from .building import Building
from .routing import compute_route, nearest_exit_route
from .spread import MonteCarloPredictor, SurrogatePredictor
from .state import IncidentState
from .triage import extract_report, prioritize


class ObservationIn(BaseModel):
    observation_id: str
    type: str
    world_position: dict
    graph_node_id: str
    camera_id: str
    confidence: float
    source: str = "simulated_camera"
    position_status: str = "simulated"
    provenance: str = "simulated"
    timestamp: str | None = None


class CivilianIn(BaseModel):
    name: str | None = None


class CivilianReportIn(BaseModel):
    civilian_id: str | None = None
    text: str


class ResponderIn(BaseModel):
    responder_id: str | None = None
    name: str | None = None
    graph_node_id: str | None = None


class ResponderLocationIn(BaseModel):
    responder_id: str
    graph_node_id: str | None = None
    world_position: dict | None = None
    text: str | None = None


class HazardIn(BaseModel):
    hazard_type: str
    node_id: str | None = None
    edge_id: str | None = None
    text: str | None = None
    default_floor: str | None = None
    verified: bool = False
    source: str = "manual"
    description: str = ""


class RouteRequest(BaseModel):
    start_node: str | None = None
    responder_id: str | None = None
    destination_node: str | None = None
    civilian_id: str | None = None
    route_id: str | None = None


class IgniteIn(BaseModel):
    node_id: str


def _current_risk(app: FastAPI) -> dict:
    if not app.state.fire_nodes:
        return {}
    if app.state.predictor:
        return app.state.predictor.predict(app.state.building, app.state.fire_nodes)
    return app.state.mc.predict(app.state.fire_nodes)


def _recompute_routes(app: FastAPI) -> None:
    incident: IncidentState = app.state.incident
    risk = _current_risk(app)
    hazards = incident.get_hazards()
    for stored in list(incident.routes.values()):
        meta = stored["meta"]
        new = compute_route(app.state.building, stored["start_node"],
                            stored["destination_node"], hazards=hazards, risk=risk,
                            route_id=stored["route_id"])
        if new["nodes"] != stored["nodes"] or new["status"] != stored["status"]:
            incident.set_route(new, meta)
            incident.append_event("route_updated",
                                  {"route_id": new["route_id"], "reason": "hazard_change",
                                   "status": new["status"]})


def _node_of(app: FastAPI, entity_id: str, role: str) -> str:
    entity = app.state.incident.get_entity(entity_id)
    if entity is None:
        raise HTTPException(404, f"{role} {entity_id} not found")
    if not entity.get("graph_node_id"):
        raise HTTPException(400, f"{role} {entity_id} has no known graph node")
    return entity["graph_node_id"]


def create_app(building_path=None) -> FastAPI:
    app = FastAPI(title="Sentinel Intelligence Engine",
                  description="Decision-support prototype. All geometry and "
                              "dynamics are simulated; humans approve all actions.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                       allow_headers=["*"])
    app.state.building = Building.load(building_path)
    app.state.incident = IncidentState(app.state.building)
    app.state.fire_nodes = set()
    app.state.predictor = SurrogatePredictor.load()
    app.state.mc = MonteCarloPredictor(app.state.building)

    building: Building = app.state.building
    incident: IncidentState = app.state.incident

    @app.get("/health")
    def health():
        return {"status": "ok", "building_id": building.building_id,
                "surrogate_loaded": app.state.predictor is not None}

    @app.get("/building")
    def get_building():
        return building.to_dict()

    @app.get("/building/graph")
    def get_graph():
        d = building.to_dict()
        return {"nodes": d["nodes"], "edges": d["edges"]}

    @app.get("/spatial/coordinate-system")
    def coordinate_system():
        d = building.to_dict()
        return {"coordinate_frame": building.coordinate_frame,
                "origin_description": d["origin_description"],
                "axes": {"x": "east (m)", "y": "north (m)", "z": "up (m)"},
                "floors": building.floors, "provenance": "simulated"}

    @app.post("/observations")
    def ingest_observation(obs: ObservationIn):
        if obs.graph_node_id not in building.nodes:
            raise HTTPException(400, f"unknown node {obs.graph_node_id}")
        incident.append_event("observation_ingested", obs.model_dump())
        if obs.type == "person":
            entity = incident.register_entity(
                "detected_person", world_position=obs.world_position,
                graph_node_id=obs.graph_node_id, source=obs.source,
                position_status=obs.position_status)
            return entity
        hazard = incident.add_hazard(obs.type, node_id=obs.graph_node_id,
                                     verified=False, source=obs.source,
                                     description=f"camera {obs.camera_id}")
        if obs.type == "fire":
            app.state.fire_nodes.add(obs.graph_node_id)
        _recompute_routes(app)
        return hazard

    @app.post("/civilians")
    def create_civilian(body: CivilianIn):
        return incident.register_entity("civilian", name=body.name)

    @app.get("/civilians")
    def list_civilians():
        return incident.get_entities("civilian")

    @app.post("/civilians/report")
    def civilian_report(body: CivilianReportIn):
        civ = (incident.get_entity(body.civilian_id) if body.civilian_id
               else incident.register_entity("civilian"))
        if civ is None:
            raise HTTPException(404, f"civilian {body.civilian_id} not found")
        report = extract_report(body.text, building)
        priority = prioritize(report, risk=_current_risk(app))
        civ["report"] = report
        civ["priority"] = priority
        for flag in priority["flags"]:
            if flag not in civ["flags"]:
                civ["flags"].append(flag)
        if report["location"]:
            incident.update_entity_location(civ["entity_id"],
                                            graph_node_id=report["location"]["node_id"],
                                            source="civilian_report",
                                            position_status="reported")
        incident.append_event("civilian_report",
                              {"civilian_id": civ["entity_id"],
                               "priority": priority["priority"], "text": body.text})
        return {"civilian": civ, "report": report, "priority": priority}

    @app.get("/civilians/{civilian_id}/advisory")
    def civilian_advisory(civilian_id: str):
        civ = incident.get_entity(civilian_id)
        if civ is None:
            raise HTTPException(404, f"civilian {civilian_id} not found")
        evac = None
        if civ.get("graph_node_id"):
            evac = nearest_exit_route(building, civ["graph_node_id"],
                                      hazards=incident.get_hazards(),
                                      risk=_current_risk(app),
                                      route_id=f"EVAC_{civilian_id}")
        en_route = any(r["meta"].get("civilian_id") == civilian_id
                       for r in incident.get_routes())
        adv = compose_advisory(civ, incident.get_hazards(), evac, building,
                               responder_en_route=en_route)
        incident.append_event("advisory_drafted", {"civilian_id": civilian_id})
        return adv

    @app.get("/advisories")
    def all_advisories():
        return [civilian_advisory(c["entity_id"])
                for c in incident.get_entities("civilian") if c.get("graph_node_id")]

    @app.post("/responders")
    def create_responder(body: ResponderIn):
        return incident.register_entity("responder", entity_id=body.responder_id,
                                        name=body.name,
                                        graph_node_id=body.graph_node_id,
                                        source="responder_report",
                                        position_status="reported")

    @app.get("/responders")
    def list_responders():
        return incident.get_entities("responder")

    @app.post("/responders/location")
    def responder_location(body: ResponderLocationIn):
        node = body.graph_node_id
        if body.text and not node:
            resolved = building.resolve_location(body.text)
            if not resolved:
                raise HTTPException(400, f"could not resolve location: {body.text!r}")
            node = resolved["node_id"]
        if incident.get_entity(body.responder_id) is None:
            raise HTTPException(404, f"responder {body.responder_id} not found")
        return incident.update_entity_location(body.responder_id,
                                               world_position=body.world_position,
                                               graph_node_id=node,
                                               source="responder_report",
                                               position_status="reported")

    @app.get("/responders/{responder_id}/guidance")
    def guidance(responder_id: str):
        responder = incident.get_entity(responder_id)
        if responder is None:
            raise HTTPException(404, f"responder {responder_id} not found")
        route = next((r for r in incident.get_routes()
                      if r["meta"].get("responder_id") == responder_id), None)
        if route is None or route["status"] != "candidate":
            return {"status": "no_active_route"}
        # snap: nearest route node on the responder's floor, else route start
        start_idx = 0
        wp = responder.get("world_position")
        if wp:
            best = None
            for i, nid in enumerate(route["nodes"]):
                n = building.nodes[nid]
                if n.floor_id == wp["floor_id"]:
                    d = (n.x - wp["x"]) ** 2 + (n.y - wp["y"]) ** 2
                    if best is None or d < best[0]:
                        best = (d, i)
            if best:
                start_idx = best[1]
        return {"route_id": route["route_id"], "status": "candidate",
                "destination_node": route["destination_node"],
                "next_steps": route["steps"][start_idx:]}

    @app.post("/hazards")
    def add_hazard(body: HazardIn):
        node_id, edge_id = body.node_id, body.edge_id
        if body.text and not node_id and not edge_id:
            resolved = building.resolve_location(body.text, body.default_floor)
            if not resolved:
                raise HTTPException(400, f"could not resolve hazard location: {body.text!r}")
            node_id = resolved["node_id"]
        if not node_id and not edge_id:
            raise HTTPException(400, "hazard needs node_id, edge_id, or resolvable text")
        hazard = incident.add_hazard(body.hazard_type, node_id=node_id,
                                     edge_id=edge_id, verified=body.verified,
                                     source=body.source, description=body.description)
        if body.hazard_type == "fire" and node_id:
            app.state.fire_nodes.add(node_id)
        _recompute_routes(app)
        return hazard

    @app.get("/hazards")
    def list_hazards():
        return incident.get_hazards()

    @app.delete("/hazards/{hazard_id}")
    def delete_hazard(hazard_id: str):
        hazard = incident.hazards.get(hazard_id)
        if not incident.remove_hazard(hazard_id):
            raise HTTPException(404, f"hazard {hazard_id} not found")
        if hazard and hazard["hazard_type"] == "fire" and hazard["node_id"]:
            still_burning = any(h["hazard_type"] == "fire" and h["node_id"] == hazard["node_id"]
                                for h in incident.get_hazards())
            if not still_burning:
                app.state.fire_nodes.discard(hazard["node_id"])
        _recompute_routes(app)
        return {"removed": hazard_id}

    @app.post("/routes/compute")
    def routes_compute(body: RouteRequest):
        start = body.start_node or (_node_of(app, body.responder_id, "responder")
                                    if body.responder_id else None)
        dest = body.destination_node or (_node_of(app, body.civilian_id, "civilian")
                                         if body.civilian_id else None)
        if not start or not dest:
            raise HTTPException(400, "need start_node/responder_id and "
                                     "destination_node/civilian_id")
        if start not in building.nodes or dest not in building.nodes:
            raise HTTPException(400, "unknown start or destination node")
        route_id = body.route_id or f"ROUTE_{len(incident.routes) + 1:03d}"
        route = compute_route(building, start, dest, hazards=incident.get_hazards(),
                              risk=_current_risk(app), route_id=route_id)
        incident.set_route(route, {"responder_id": body.responder_id,
                                   "civilian_id": body.civilian_id})
        incident.append_event("route_computed",
                              {"route_id": route_id, "status": route["status"]})
        return route

    @app.get("/routes")
    def list_routes():
        return incident.get_routes()

    @app.get("/spread/prediction")
    def spread_prediction():
        fire = sorted(app.state.fire_nodes)
        if not fire:
            return {"fire_nodes": [], "horizon_minutes": 10, "method": "none",
                    "risk": {n: 0.0 for n in building.nodes}, "provenance": "simulated"}
        predictor = app.state.predictor or app.state.mc
        risk = _current_risk(app)
        return {"fire_nodes": fire, "horizon_minutes": 10,
                "method": predictor.method_name, "risk": risk,
                "provenance": "simulated"}

    @app.post("/spread/ignite")
    def ignite(body: IgniteIn):
        if body.node_id not in building.nodes:
            raise HTTPException(400, f"unknown node {body.node_id}")
        app.state.fire_nodes.add(body.node_id)
        incident.add_hazard("fire", node_id=body.node_id, verified=True,
                            source="demo_control", description="demo ignition")
        _recompute_routes(app)
        return spread_prediction()

    @app.post("/rescue/prioritize")
    def rescue_prioritize():
        risk = _current_risk(app)
        hazards = incident.get_hazards()
        recs = []
        civilians = [c for c in incident.get_entities("civilian") if c.get("priority")]
        for civ in sorted(civilians, key=lambda c: c["priority"]["score"], reverse=True):
            best = (None, None)
            if civ.get("graph_node_id"):
                for resp in incident.get_entities("responder"):
                    if not resp.get("graph_node_id"):
                        continue
                    r = compute_route(building, resp["graph_node_id"],
                                      civ["graph_node_id"], hazards=hazards,
                                      risk=risk, include_alternate=False)
                    if r["status"] == "candidate" and (best[1] is None
                                                       or r["total_cost"] < best[1]):
                        best = (resp["entity_id"], r["total_cost"])
            recs.append({"civilian_id": civ["entity_id"],
                         "priority": civ["priority"]["priority"],
                         "score": civ["priority"]["score"],
                         "reason": civ["priority"]["reason"],
                         "flags": civ["priority"]["flags"],
                         "nearest_responder_id": best[0],
                         "route_status": "candidate" if best[0] else "unreachable",
                         "estimated_cost": best[1],
                         "requires_command_approval": True})
        incident.append_event("rescue_prioritized", {"count": len(recs)})
        return {"recommendations": recs}

    @app.get("/incident/state")
    def incident_state():
        return incident.snapshot()

    @app.get("/incident/events")
    def incident_events(since: int = 0):
        return {"events": incident.events_since(since)}

    return app


app = create_app()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_api.py -v`
Expected: all 11 PASS.

- [ ] **Step 5: Verify server boots**

Run: `.venv/bin/uvicorn sentinel_engine.api:app --port 8000 & sleep 3 && curl -s localhost:8000/health && kill %1`
Expected: `{"status":"ok","building_id":"jacobs_hall","surrogate_loaded":true}`

- [ ] **Step 6: Commit**

```bash
git add sentinel_engine/api.py sentinel_engine/tests/test_api.py
git commit -m "feat: FastAPI service wiring routing, spread, triage, advisories, state"
```

---

### Task 10: End-to-end demo, integration test, INTEGRATION.md

**Files:**
- Create: `sentinel_engine/demo.py`
- Create: `sentinel_engine/INTEGRATION.md`
- Test: `sentinel_engine/tests/test_integration.py`

**Interfaces:**
- Consumes: the HTTP API only (Task 9) — demo and integration test drive everything through `TestClient`, proving the frontend can too.

- [ ] **Step 1: Write failing integration test**

`sentinel_engine/tests/test_integration.py`:

```python
"""Full scenario through HTTP only — what the frontend developer will do."""
from fastapi.testclient import TestClient
from sentinel_engine.api import create_app
from sentinel_engine.perception import scenario_observations


def test_full_scenario():
    client = TestClient(create_app())

    # Step 1: initial state — responders at entrance/staging
    client.post("/responders", json={"responder_id": "UNIT_ALPHA",
                                     "graph_node_id": "F1_ENTRANCE_MAIN"})
    client.post("/responders", json={"responder_id": "UNIT_BRAVO",
                                     "graph_node_id": "EXT_STAGING"})

    # Step 2: civilian distress report → urgent review
    rep = client.post("/civilians/report", json={
        "text": "I'm in Studio 210 on the second floor. There's smoke outside "
                "and my friend can't walk."}).json()
    civ_id = rep["civilian"]["entity_id"]
    assert rep["priority"]["priority"] == "urgent_review"
    assert rep["civilian"]["graph_node_id"] == "F2_STUDIO_210"

    # Step 3: simulated perception observations → detections + fire hazard
    for obs in scenario_observations():
        client.post("/observations", json=obs)
    pred = client.get("/spread/prediction").json()
    assert pred["method"] in ("surrogate_ml_simulated", "monte_carlo_simulated")
    assert pred["risk"]["F2_CORRIDOR_EAST"] == 1.0

    # Step 4: candidate rescue route avoids the burning east corridor
    route = client.post("/routes/compute", json={
        "responder_id": "UNIT_ALPHA", "civilian_id": civ_id}).json()
    assert route["status"] == "candidate"
    assert "F2_CORRIDOR_EAST" not in route["nodes"]
    original = route["nodes"]

    # Step 5: hazard update — west stairwell blocked → reroute
    client.post("/hazards", json={"hazard_type": "blocked", "text": "west stairwell",
                                  "default_floor": "F2", "verified": True,
                                  "source": "responder_report"})
    routes = client.get("/routes").json()
    updated = next(r for r in routes if r["route_id"] == route["route_id"])
    assert updated["nodes"] != original

    # AR guidance reflects the new route
    g = client.get("/responders/UNIT_ALPHA/guidance").json()
    assert g["route_id"] == route["route_id"]

    # Step 6: advisory + prioritization + shared state
    adv = client.get(f"/civilians/{civ_id}/advisory").json()
    assert adv["requires_command_approval"] is True
    recs = client.post("/rescue/prioritize").json()["recommendations"]
    assert recs[0]["civilian_id"] == civ_id
    state = client.get("/incident/state").json()
    assert state["coordinate_frame"] == "JACOBS_LOCAL"
    assert state["entities"] and state["hazards"] and state["routes"]
    events = client.get("/incident/events", params={"since": 0}).json()["events"]
    types = {e["event_type"] for e in events}
    assert {"civilian_report", "observation_ingested", "route_computed",
            "hazard_added", "route_updated", "advisory_drafted",
            "rescue_prioritized"} <= types
    seqs = [e["seq"] for e in events]
    assert seqs == sorted(seqs)
```

- [ ] **Step 2: Run to verify current behavior**

Run: `.venv/bin/python -m pytest sentinel_engine/tests/test_integration.py -v`
Expected: PASS if Tasks 1–9 are correct (this test consumes only existing endpoints). If it fails, fix the responsible module — do not weaken assertions.

- [ ] **Step 3: Write `demo.py`**

```python
"""Reproducible end-to-end Sentinel demo. Run:
    .venv/bin/python -m sentinel_engine.demo
Exits nonzero on any failed beat. Everything shown is simulated."""
import json
import sys

from fastapi.testclient import TestClient

from .api import create_app
from .perception import scenario_observations


def beat(title: str):
    print(f"\n=== {title} " + "=" * max(0, 60 - len(title)))


def main() -> int:
    client = TestClient(create_app())

    beat("1. Initial state")
    client.post("/responders", json={"responder_id": "UNIT_ALPHA",
                                     "graph_node_id": "F1_ENTRANCE_MAIN"})
    client.post("/responders", json={"responder_id": "UNIT_BRAVO",
                                     "graph_node_id": "EXT_STAGING"})
    print("responders:", [r["entity_id"] for r in client.get("/responders").json()])

    beat("2. Civilian distress report")
    rep = client.post("/civilians/report", json={
        "text": "I'm in Studio 210 on the second floor. There's smoke outside "
                "and my friend can't walk."}).json()
    civ_id = rep["civilian"]["entity_id"]
    print("resolved to:", rep["civilian"]["graph_node_id"])
    print("priority:", rep["priority"]["priority"], "—", rep["priority"]["reason"])

    beat("3. Simulated camera observations (CV layer stand-in)")
    for obs in scenario_observations():
        client.post("/observations", json=obs)
    pred = client.get("/spread/prediction").json()
    print("fire nodes:", pred["fire_nodes"], "| method:", pred["method"])
    top = sorted(pred["risk"].items(), key=lambda kv: -kv[1])[:5]
    print("highest predicted spread risk:", top)

    beat("4. Candidate rescue route (risk-aware)")
    route = client.post("/routes/compute", json={
        "responder_id": "UNIT_ALPHA", "civilian_id": civ_id}).json()
    print("route:", " -> ".join(route["nodes"]))
    print(f"distance {route['total_distance_m']} m | cost {route['total_cost']} "
          f"| status {route['status']} | needs approval: "
          f"{route['requires_command_approval']}")

    beat("5. Hazard update: 'west stairwell is blocked' → reroute")
    client.post("/hazards", json={"hazard_type": "blocked", "text": "west stairwell",
                                  "default_floor": "F2", "verified": True,
                                  "source": "responder_report"})
    updated = next(r for r in client.get("/routes").json()
                   if r["route_id"] == route["route_id"])
    print("new route:", " -> ".join(updated["nodes"]))
    if updated["nodes"] == route["nodes"]:
        print("ERROR: route did not change"); return 1

    beat("6. AR guidance for UNIT_ALPHA")
    g = client.get("/responders/UNIT_ALPHA/guidance").json()
    for step in g["next_steps"]:
        print(" •", step["instruction"],
              f"({step['distance_m']} m, bearing {step['bearing_degrees']}°)")

    beat("7. Civilian advisory draft (pending command approval)")
    adv = client.get(f"/civilians/{civ_id}/advisory").json()
    print(adv["message"])

    beat("8. Rescue prioritization + shared incident state")
    for r in client.post("/rescue/prioritize").json()["recommendations"]:
        print(f" • {r['civilian_id']}: {r['priority']} (score {r['score']}) "
              f"→ {r['nearest_responder_id']} — {r['reason']}")
    state = client.get("/incident/state").json()
    print(f"entities={len(state['entities'])} hazards={len(state['hazards'])} "
          f"routes={len(state['routes'])} events={state['last_event_seq']}")
    print("\nfull state JSON is frontend-ready; sample entity:")
    print(json.dumps(state["entities"][0], indent=2))
    print("\nDEMO COMPLETE — all beats executed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: Run the demo**

Run: `.venv/bin/python -m sentinel_engine.demo`
Expected: all 8 beats print; exit code 0; Step 5 shows a different route than Step 4.

- [ ] **Step 5: Write `INTEGRATION.md`**

Write `sentinel_engine/INTEGRATION.md` with exactly these sections, filling the AUC numbers recorded in Task 5 Step 5 and verifying every example against the running service (copy real responses, truncated where long):

```markdown
# Sentinel Engine — Integration Guide

## Start
    python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
    .venv/bin/uvicorn sentinel_engine.api:app --port 8000
Base URL: http://localhost:8000 — OpenAPI docs: http://localhost:8000/docs
CORS is open for local development. Reproducible demo: `.venv/bin/python -m sentinel_engine.demo`

## Coordinate system
`GET /spatial/coordinate-system`. Frame `JACOBS_LOCAL`: local meters (NOT lat/long),
x east, y north, z up, origin at the illustrative southwest ground corner.
Floor elevations: B=-4.0, F1=0.0, F2=4.0, F3=8.0. Every position object:
`{x, y, z, floor_id, coordinate_frame}`. 2D floor rendering: use (x, y) + floor_id.
3D building view: use (x, y, z) directly. Route polylines and step waypoints are
already in this frame — no transformations needed client-side.

## What is real vs simulated
- REAL: graph algorithms, triage rules, trained surrogate model + its validation.
- SIMULATED (labeled in payloads): all building geometry (`provenance: "simulated"`),
  camera observations (`source: "simulated_camera"`), fire-spread dynamics
  (plausible-physics simulator, not real fire behavior).
- The spread surrogate is a GradientBoostingClassifier trained ONLY on randomized
  synthetic buildings; Jacobs Hall was held out. Validation AUC vs simulated
  ground truth: <fill from training output>. It predicts OUR simulator, not real fire.

## Core flows (verified example payloads)
[for each: civilian report POST /civilians/report; observation POST /observations;
hazard POST /hazards (incl. text resolution: {"hazard_type":"blocked","text":"west
stairwell","default_floor":"F2","verified":true}); route POST /routes/compute;
guidance GET /responders/{id}/guidance; advisory GET /civilians/{id}/advisory;
spread GET /spread/prediction; prioritize POST /rescue/prioritize —
real request + truncated real response each]

## Polling
Poll `GET /incident/state` (full picture) or `GET /incident/events?since=<last seq>`
(deltas). `route_updated` events signal reroutes; the guidance endpoint always
serves the current route.

## Map rendering checklist
[one full /incident/state example + where each marker type comes from:
entities → world_position; hazards → node_id → /building/graph node coords;
routes → polyline; risk heat → /spread/prediction risk dict keyed by node_id]

## Known limitations
No persistence (in-memory, resets on restart). No auth. Single incident.
Identity never merged across cameras. Room-level positions are node anchors,
not exact. Routes are graph candidates requiring command approval — the cost
model is not a safety guarantee.
```

- [ ] **Step 6: Run the full test suite**

Run: `.venv/bin/python -m pytest sentinel_engine/tests -v`
Expected: ALL tests pass (≈45). Also verify `/demo` untouched: `git status --short | grep demo` prints nothing.

- [ ] **Step 7: Commit**

```bash
git add sentinel_engine/demo.py sentinel_engine/INTEGRATION.md sentinel_engine/tests/test_integration.py
git commit -m "feat: end-to-end demo, HTTP integration test, integration guide"
```

---

## Final verification checklist (after all tasks)

- [ ] `.venv/bin/python -m pytest sentinel_engine/tests -v` — all pass.
- [ ] `.venv/bin/python -m sentinel_engine.demo` — exits 0, route changes at beat 5.
- [ ] `.venv/bin/uvicorn sentinel_engine.api:app --port 8000` boots; `/docs` renders.
- [ ] INTEGRATION.md AUC numbers match the actual training output.
- [ ] `git log` shows one commit per task; nothing outside allowed paths changed.
