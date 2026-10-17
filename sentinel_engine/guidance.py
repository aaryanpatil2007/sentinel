"""Guidance packets: everything a first-person guidance view needs to draw one
persona's route — blueprint-style today, AR later.

A packet is renderer-agnostic JSON: floor geometry (zones, walls, doors derived
from the building model), the route polyline, a densified `render_path` that
turns stairwell hops into ramps, turn-classified steps, hazard markers, and the
route's candidate status. Pure functions; nothing here changes incident state
or decides anything. Routes stay `candidate` and `requires_command_approval`
exactly as the routing layer produced them.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from .building import Building

PACKET_VERSION = "1"
DOOR_WIDTH_M = 1.2
WALL_HEIGHT_M = 2.7
STAIR_RUN_M = 2.0          # half-length of the ramp drawn inside a stairwell footprint
STAIR_INSET_M = 0.6        # keep ramps inside the stairwell rectangle
_EPS = 1e-6

# Heading-change thresholds (degrees) for turn classification.
_TURN_BANDS = [(20, "straight"), (60, "slight"), (120, "turn"), (160, "sharp")]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# --------------------------------------------------------------------------- geometry

def _rect_exit(rect: dict, inside: tuple[float, float], outside: tuple[float, float]):
    """Where the segment inside→outside leaves `rect`. Returns (t, wall, x, y) or None.
    `inside` may lie on the boundary (t == 0), e.g. an entrance node on the facade."""
    dx, dy = outside[0] - inside[0], outside[1] - inside[1]
    sides = (("W", "x", rect["x_min"], rect["y_min"], rect["y_max"]),
             ("E", "x", rect["x_max"], rect["y_min"], rect["y_max"]),
             ("S", "y", rect["y_min"], rect["x_min"], rect["x_max"]),
             ("N", "y", rect["y_max"], rect["x_min"], rect["x_max"]))
    best = None
    for wall, axis, value, lo, hi in sides:
        d = dx if axis == "x" else dy
        if abs(d) < _EPS:
            continue
        start = inside[0] if axis == "x" else inside[1]
        t = (value - start) / d
        if t < -_EPS or t > 1 + _EPS:
            continue
        px, py = inside[0] + dx * t, inside[1] + dy * t
        along = py if axis == "x" else px
        if along < lo - _EPS or along > hi + _EPS:
            continue
        if best is None or t < best[0]:
            best = (max(t, 0.0), wall, round(px, 3), round(py, 3))
    return best


def derive_doors(building: Building) -> list[dict]:
    """One door per (edge, zone) where a same-floor edge crosses a zone boundary.
    Corridor-internal edges (both nodes in one zone) and inter-floor edges make
    no doors."""
    doors = []
    for edge in building.edges.values():
        a, b = building.nodes[edge.from_node], building.nodes[edge.to_node]
        if a.floor_id != b.floor_id:
            continue
        za, zb = building.zone_for(a.node_id), building.zone_for(b.node_id)
        if not za or not zb or za["zone_id"] == zb["zone_id"]:
            continue
        for zone, this, other in ((za, a, b), (zb, b, a)):
            hit = _rect_exit(zone, (this.x, this.y), (other.x, other.y))
            if hit is None:
                continue
            _, wall, x, y = hit
            doors.append({"door_id": f"{edge.edge_id}_{zone['zone_id']}",
                          "edge_id": edge.edge_id, "edge_type": edge.edge_type,
                          "zone_id": zone["zone_id"], "floor_id": a.floor_id,
                          "wall": wall, "x": x, "y": y, "width_m": DOOR_WIDTH_M})
    return doors


def _wall_segments(zone: dict, doors: list[dict]) -> list[dict]:
    """Four rectangle sides minus door gaps."""
    sides = {"W": ("x", zone["x_min"], zone["y_min"], zone["y_max"]),
             "E": ("x", zone["x_max"], zone["y_min"], zone["y_max"]),
             "S": ("y", zone["y_min"], zone["x_min"], zone["x_max"]),
             "N": ("y", zone["y_max"], zone["x_min"], zone["x_max"])}
    out = []
    for wall, (axis, fixed, lo, hi) in sides.items():
        gaps = sorted((d["y"] if axis == "x" else d["x"], d["width_m"] / 2)
                      for d in doors if d["wall"] == wall)
        cursor = lo
        pieces = []
        for centre, half in gaps:
            g0, g1 = max(lo, centre - half), min(hi, centre + half)
            if g0 > cursor + _EPS:
                pieces.append((cursor, g0))
            cursor = max(cursor, g1)
        if hi > cursor + _EPS:
            pieces.append((cursor, hi))
        for p0, p1 in pieces:
            if axis == "x":
                seg = {"x1": fixed, "y1": p0, "x2": fixed, "y2": p1}
            else:
                seg = {"x1": p0, "y1": fixed, "x2": p1, "y2": fixed}
            out.append({"zone_id": zone["zone_id"], "floor_id": zone["floor_id"],
                        "wall": wall, "height_m": WALL_HEIGHT_M, **seg})
    return out


def floor_geometry(building: Building) -> list[dict]:
    """Per-floor drawable geometry: zones, derived walls and doors, outline."""
    doors = derive_doors(building)
    floors = []
    for f in building.floors:
        fid = f["floor_id"]
        zones = [z for z in building.zones.values() if z["floor_id"] == fid]
        f_doors = [d for d in doors if d["floor_id"] == fid]
        walls = []
        for z in zones:
            walls.extend(_wall_segments(z, [d for d in f_doors if d["zone_id"] == z["zone_id"]]))
        interior = [z for z in zones if z["kind"] != "staging"] or zones
        outline = None
        if interior:
            outline = {"x_min": min(z["x_min"] for z in interior),
                       "y_min": min(z["y_min"] for z in interior),
                       "x_max": max(z["x_max"] for z in interior),
                       "y_max": max(z["y_max"] for z in interior)}
        floors.append({"floor_id": fid, "name": f["name"], "elevation_m": f["elevation_m"],
                       "outline": outline, "zones": zones, "walls": walls,
                       "doors": f_doors, "provenance": "simulated"})
    return floors


# --------------------------------------------------------------------------- path

def _pt(building: Building, node_id: str, x=None, y=None, z=None) -> dict:
    n = building.nodes[node_id]
    return {"x": round(n.x if x is None else x, 3), "y": round(n.y if y is None else y, 3),
            "z": round(n.z if z is None else z, 3), "floor_id": n.floor_id,
            "node_id": node_id}


def _unit(dx: float, dy: float) -> tuple[float, float]:
    m = math.hypot(dx, dy)
    return (dx / m, dy / m) if m > _EPS else (0.0, 0.0)


def render_path(building: Building, nodes: list[str]) -> tuple[list[dict], list[float]]:
    """Densified path for drawing/walking. Inter-floor hops (stair nodes share x,y
    across floors) become a ramp laid along the walking direction inside the
    stairwell footprint, so a first-person camera climbs instead of teleporting.

    Returns (points, node_distance) where node_distance[i] is the distance
    along the rendered path at which route node i is reached."""
    if not nodes:
        return [], []
    pts: list[dict] = [_pt(building, nodes[0])]
    node_dist = [0.0]

    def push(p: dict) -> None:
        last = pts[-1]
        d = math.dist((last["x"], last["y"], last["z"]), (p["x"], p["y"], p["z"]))
        p = {**p, "distance_along_m": round(pts[-1]["distance_along_m"] + d, 3)}
        pts.append(p)

    pts[0]["distance_along_m"] = 0.0
    i = 0
    while i < len(nodes) - 1:
        a, b = building.nodes[nodes[i]], building.nodes[nodes[i + 1]]
        if a.floor_id == b.floor_id:
            push(_pt(building, b.node_id))
            node_dist.append(pts[-1]["distance_along_m"])
            i += 1
            continue
        # stair hop a -> b: ramp from the entry side to the exit side
        prev = building.nodes[nodes[i - 1]] if i > 0 else None
        nxt = building.nodes[nodes[i + 2]] if i + 2 < len(nodes) else None
        entry = _unit(a.x - prev.x, a.y - prev.y) if prev else (0.0, 0.0)
        exit_ = _unit(nxt.x - b.x, nxt.y - b.y) if nxt else (0.0, 0.0)
        if entry == (0.0, 0.0) and exit_ == (0.0, 0.0):
            entry, exit_ = (-1.0, 0.0), (1.0, 0.0)
        elif entry == (0.0, 0.0):
            entry = (-exit_[0], -exit_[1])
        elif exit_ == (0.0, 0.0):
            exit_ = (-entry[0], -entry[1])
        run = STAIR_RUN_M
        zone = building.zone_for(a.node_id)
        if zone:
            run = min(run, (zone["x_max"] - zone["x_min"]) / 2 - STAIR_INSET_M,
                      (zone["y_max"] - zone["y_min"]) / 2 - STAIR_INSET_M)
            run = max(run, 0.5)
        start = (a.x + entry[0] * run, a.y + entry[1] * run)
        end = (b.x + exit_[0] * run, b.y + exit_[1] * run)
        if math.dist(start, end) < 1.0:            # same way in and out: flip the start
            start = (a.x - entry[0] * run, a.y - entry[1] * run)
        push(_pt(building, a.node_id, x=start[0], y=start[1], z=a.z))
        push(_pt(building, b.node_id, x=end[0], y=end[1], z=b.z))
        node_dist.append(pts[-1]["distance_along_m"])
        if nxt is None:                           # stairs are the destination
            push(_pt(building, b.node_id))
            node_dist[-1] = pts[-1]["distance_along_m"]
        i += 1
    return pts, node_dist


# --------------------------------------------------------------------------- steps

def _bearing(a, b) -> float:
    return (math.degrees(math.atan2(b.x - a.x, b.y - a.y)) + 360) % 360


def classify_steps(building: Building, nodes: list[str], steps: list[dict],
                   node_dist: list[float]) -> list[dict]:
    """Adds turn cues, floor ids, and path distances to routing steps."""
    out = []
    last_heading: float | None = None
    after_stairs = False
    for i, step in enumerate(steps):
        a, b = building.nodes[nodes[i]], building.nodes[nodes[i + 1]]
        flat = math.hypot(b.x - a.x, b.y - a.y)
        if a.floor_id != b.floor_id:
            turn, change = ("up" if b.z > a.z else "down"), 0.0
            after_stairs = True
        elif flat < _EPS:
            turn, change = "straight", 0.0
        else:
            heading = _bearing(a, b)
            if last_heading is None:
                turn, change = "start", 0.0
            elif after_stairs:
                turn, change = "continue", 0.0
            else:
                change = (heading - last_heading + 540) % 360 - 180
                mag = abs(change)
                band = next((name for limit, name in _TURN_BANDS if mag < limit), "u_turn")
                if band in ("straight", "u_turn"):
                    turn = band
                else:
                    side = "right" if change > 0 else "left"
                    turn = f"{band}_{side}" if band != "turn" else side
            last_heading = heading
            after_stairs = False
        out.append({**step, "index": i, "from_node": a.node_id, "from_label": a.label,
                    "to_label": b.label, "from_floor_id": a.floor_id,
                    "floor_id": b.floor_id, "turn": turn,
                    "heading_change_degrees": round(change, 1),
                    "start_at_m": round(node_dist[i], 3),
                    "arrive_at_m": round(node_dist[i + 1], 3),
                    "is_final": i == len(steps) - 1})
    return out


# --------------------------------------------------------------------------- hazards

def hazard_markers(building: Building, hazards, route_nodes: list[str],
                   route_edges: list[str]) -> list[dict]:
    markers = []
    on_nodes, on_edges = set(route_nodes), set(route_edges)
    for h in hazards:
        pos, where = None, None
        if h.get("node_id") and h["node_id"] in building.nodes:
            n = building.nodes[h["node_id"]]
            pos, where = building.node_position(n.node_id), n.label
        elif h.get("edge_id") and h["edge_id"] in building.edges:
            e = building.edges[h["edge_id"]]
            a, b = building.nodes[e.from_node], building.nodes[e.to_node]
            pos = {"x": round((a.x + b.x) / 2, 3), "y": round((a.y + b.y) / 2, 3),
                   "z": round((a.z + b.z) / 2, 3), "floor_id": a.floor_id,
                   "coordinate_frame": building.coordinate_frame}
            where = f"{a.label} – {b.label}"
        if pos is None:
            continue
        markers.append({"hazard_id": h["hazard_id"], "hazard_type": h["hazard_type"],
                        "verified": bool(h.get("verified")), "source": h.get("source"),
                        "position": pos, "floor_id": pos["floor_id"],
                        "label": f"{h['hazard_type'].capitalize()} · {where}",
                        "on_route": (h.get("node_id") in on_nodes) or (h.get("edge_id") in on_edges)})
    return markers


# --------------------------------------------------------------------------- snapping

def snap_index(building: Building, route_nodes: list[str], world_position: dict | None) -> int:
    """Index of the nearest route node on the entity's floor; 0 if unknown."""
    if not world_position or not route_nodes:
        return 0
    best = None
    for i, nid in enumerate(route_nodes):
        n = building.nodes[nid]
        if n.floor_id == world_position.get("floor_id"):
            d = (n.x - world_position["x"]) ** 2 + (n.y - world_position["y"]) ** 2
            if best is None or d < best[0]:
                best = (d, i)
    return best[1] if best else 0


# --------------------------------------------------------------------------- packet

def _entity_summary(entity: dict | None) -> dict | None:
    if not entity:
        return None
    return {"entity_id": entity["entity_id"], "entity_type": entity.get("entity_type"),
            "name": entity.get("name"), "graph_node_id": entity.get("graph_node_id"),
            "world_position": entity.get("world_position"),
            "position_status": entity.get("position_status"),
            "flags": list(entity.get("flags") or [])}


def build_packet(building: Building, persona: str, entity: dict | None, route: dict | None,
                 hazards=(), risk: dict | None = None, destination_entity: dict | None = None,
                 message: str | None = None, responder_en_route: bool | None = None,
                 snap_to_entity: bool = True) -> dict:
    """Assemble a guidance packet. `persona` is "responder" or "civilian".
    `route` may be None (no active route) or an unreachable route."""
    assert persona in ("responder", "civilian")
    hazards = list(hazards)
    risk = dict(risk or {})
    floors = floor_geometry(building)

    packet = {"packet_version": PACKET_VERSION, "persona": persona,
              "generated_at": _now(), "provenance": "simulated",
              "building_id": building.building_id,
              "coordinate_frame": building.coordinate_frame,
              "entity": _entity_summary(entity),
              "route_id": None, "status": "no_active_route",
              "requires_command_approval": True, "unreachable_reason": None,
              "origin": None, "destination": None,
              "nodes": [], "polyline": [], "render_path": [], "steps": [],
              "alternate_render_path": [],
              "total_distance_m": 0.0, "total_cost": 0.0, "hazards_considered": [],
              "assumptions": [], "floors": floors, "hazards": [],
              "risk": {}, "zone_risk": {}, "message": message,
              "responder_en_route": responder_en_route,
              "disclaimer": ("Illustrative simulated building geometry. Candidate route "
                             "for command review; graph cost is not a guarantee of any kind.")}

    if persona == "civilian" and entity and not entity.get("graph_node_id"):
        packet["status"] = "no_location"
        packet["hazards"] = hazard_markers(building, hazards, [], [])
        return packet
    if route is None:
        packet["hazards"] = hazard_markers(building, hazards, [], [])
        return packet

    packet.update({"route_id": route["route_id"], "status": route["status"],
                   "requires_command_approval": route["requires_command_approval"],
                   "unreachable_reason": route.get("unreachable_reason"),
                   "assumptions": list(route.get("assumptions", [])),
                   "hazards_considered": list(route.get("hazards_considered", [])),
                   "total_cost": route.get("total_cost", 0.0)})

    nodes = list(route.get("nodes", []))
    start = 0
    if snap_to_entity and entity and nodes:
        start = snap_index(building, nodes, entity.get("world_position"))
    nodes = nodes[start:]
    steps = list(route.get("steps", []))[start:]
    edge_ids = list(route.get("edge_ids", []))[start:]
    packet["hazards"] = hazard_markers(building, hazards, nodes, edge_ids)

    if route["status"] != "candidate" or not nodes:
        packet["origin"] = ({"node_id": route["start_node"],
                             "label": building.nodes[route["start_node"]].label,
                             "position": building.node_position(route["start_node"])}
                            if route.get("start_node") in building.nodes else None)
        return packet

    points, node_dist = render_path(building, nodes)
    packet["nodes"] = nodes
    packet["polyline"] = [building.node_position(n) for n in nodes]
    packet["render_path"] = points
    packet["steps"] = classify_steps(building, nodes, steps, node_dist)
    packet["total_distance_m"] = round(sum(building.edges[e].distance_m for e in edge_ids), 1)
    packet["progress"] = {"snapped_node_index": start, "snapped_node_id": nodes[0],
                          "skipped_steps": start}

    dest_node = nodes[-1]
    dest_kind = "exit" if persona == "civilian" else ("civilian" if destination_entity else "node")
    packet["origin"] = {"node_id": nodes[0], "label": building.nodes[nodes[0]].label,
                        "position": building.node_position(nodes[0])}
    packet["destination"] = {"node_id": dest_node, "label": building.nodes[dest_node].label,
                             "kind": dest_kind, "position": building.node_position(dest_node),
                             "entity": _entity_summary(destination_entity)}

    on_route = {building.nodes[n].floor_id for n in nodes}
    for f in packet["floors"]:
        f["on_route"] = f["floor_id"] in on_route

    if persona == "responder":
        packet["risk"] = risk
        packet["zone_risk"] = {z["zone_id"]: round(max((risk.get(n, 0.0) for n in z["node_ids"]),
                                                       default=0.0), 4)
                               for z in building.zones.values()}
        alt = route.get("alternate")
        if alt and alt.get("status") == "candidate":
            alt_points, _ = render_path(building, alt["nodes"])
            packet["alternate_render_path"] = alt_points
            packet["alternate_route_id"] = alt["route_id"]
    return packet
