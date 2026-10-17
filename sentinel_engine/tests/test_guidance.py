import pytest
from sentinel_engine.building import Building
from sentinel_engine.guidance import (DOOR_WIDTH_M, build_packet, classify_steps, derive_doors,
                                      floor_geometry, hazard_markers, render_path, snap_index)
from sentinel_engine.routing import compute_route, nearest_exit_route


@pytest.fixture(scope="module")
def building():
    return Building.load()


def _hazard(hid, hazard_type, node_id=None, edge_id=None, verified=False):
    return {"hazard_id": hid, "hazard_type": hazard_type, "node_id": node_id,
            "edge_id": edge_id, "verified": verified, "source": "test", "description": ""}


def _entity(eid, etype, node, building):
    return {"entity_id": eid, "entity_type": etype, "name": None, "graph_node_id": node,
            "world_position": building.node_position(node), "position_status": "reported",
            "flags": []}


# ---------------------------------------------------------------- geometry

def test_doors_only_where_same_floor_edges_cross_zone_boundaries(building):
    doors = derive_doors(building)
    by_edge = {}
    for d in doors:
        by_edge.setdefault(d["edge_id"], []).append(d)
    for eid, e in building.edges.items():
        a, b = building.nodes[e.from_node], building.nodes[e.to_node]
        same_zone = building.zone_of_node[a.node_id] == building.zone_of_node[b.node_id]
        if a.floor_id != b.floor_id or same_zone:
            assert eid not in by_edge          # stairs/elevator shafts, corridor-internal
        else:
            assert len(by_edge[eid]) == 2      # one per side of the wall


def test_room_door_sits_on_shared_wall(building):
    doors = {d["door_id"]: d for d in derive_doors(building)}
    room = doors["E019_F2_Z_STUDIO_210"]
    corridor = doors["E019_F2_Z_CORRIDOR"]
    assert (room["x"], room["y"], room["wall"]) == (12.0, 11.5, "S")
    assert (corridor["x"], corridor["y"], corridor["wall"]) == (12.0, 11.5, "N")


def test_walls_have_a_gap_at_each_door(building):
    f2 = next(f for f in floor_geometry(building) if f["floor_id"] == "F2")
    south = [w for w in f2["walls"] if w["zone_id"] == "F2_Z_STUDIO_210" and w["wall"] == "S"]
    assert len(south) == 2
    xs = sorted((w["x1"], w["x2"]) for w in south)
    assert xs[0][1] == pytest.approx(12.0 - DOOR_WIDTH_M / 2)
    assert xs[1][0] == pytest.approx(12.0 + DOOR_WIDTH_M / 2)
    assert all(w["y1"] == 11.5 and w["y2"] == 11.5 for w in south)


def test_floor_geometry_covers_all_floors_with_outline(building):
    floors = floor_geometry(building)
    assert [f["floor_id"] for f in floors] == ["B", "F1", "F2", "F3"]
    for f in floors:
        assert f["outline"] and f["zones"] and f["walls"]
        assert f["provenance"] == "simulated"
    f1 = floors[1]
    assert f1["outline"]["y_min"] == 0.0        # lobbies reach the facade
    assert not any(z["kind"] == "staging" and z["y_max"] > 0 for z in f1["zones"])


# ---------------------------------------------------------------- render path

def test_render_path_turns_stair_hops_into_ramps(building):
    nodes = ["F1_CORRIDOR_WEST", "F1_STAIR_A", "F2_STAIR_A", "F2_CORRIDOR_WEST"]
    pts, node_dist = render_path(building, nodes)
    assert len(node_dist) == len(nodes)
    assert node_dist == sorted(node_dist)
    ramp = [(p["x"], p["z"]) for p in pts]
    # no vertical teleport: every consecutive pair with a z change also moves in x/y
    for a, b in zip(pts, pts[1:]):
        if a["z"] != b["z"]:
            assert (a["x"], a["y"]) != (b["x"], b["y"])
    assert ramp[0] == (12.0, 0.0) and ramp[-1] == (12.0, 4.0)
    zone = building.zone_for("F1_STAIR_A")
    for p in pts[1:-1]:
        assert zone["x_min"] <= p["x"] <= zone["x_max"]
        assert zone["y_min"] <= p["y"] <= zone["y_max"]
    assert all(b["distance_along_m"] > a["distance_along_m"] for a, b in zip(pts, pts[1:]))


def test_render_path_keeps_destination_when_route_ends_on_stairs(building):
    pts, node_dist = render_path(building, ["F1_CORRIDOR_WEST", "F1_STAIR_A", "F2_STAIR_A"])
    assert (pts[-1]["x"], pts[-1]["y"], pts[-1]["z"]) == (5.0, 10.0, 4.0)
    assert node_dist[-1] == pts[-1]["distance_along_m"]


# ---------------------------------------------------------------- steps

def test_turn_classification_on_demo_route(building):
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", include_alternate=False)
    _, node_dist = render_path(building, route["nodes"])
    steps = classify_steps(building, route["nodes"], route["steps"], node_dist)
    assert [s["turn"] for s in steps] == ["start", "left", "straight", "up", "continue", "left"]
    assert steps[-1]["is_final"] and steps[0]["index"] == 0
    assert steps[3]["from_floor_id"] == "F1" and steps[3]["floor_id"] == "F2"
    assert all(s["arrive_at_m"] > s["start_at_m"] for s in steps)
    assert steps[-1]["arrive_at_m"] == node_dist[-1]


def test_right_turn_and_down_for_civilian_exit(building):
    evac = nearest_exit_route(building, "F2_STUDIO_210")
    _, node_dist = render_path(building, evac["nodes"])
    turns = [s["turn"] for s in classify_steps(building, evac["nodes"], evac["steps"], node_dist)]
    assert turns[0] == "start" and "down" in turns
    assert any(t.endswith("right") for t in turns)


# ---------------------------------------------------------------- hazards & snapping

def test_hazard_markers_positions_and_on_route_flag(building):
    hz = [_hazard("H1", "fire", node_id="F2_CORRIDOR_EAST"),
          _hazard("H2", "blocked", edge_id="E031", verified=True),
          _hazard("H3", "smoke", node_id="NOPE")]
    m = hazard_markers(building, hz, ["F1_STAIR_A", "F2_STAIR_A"], ["E031"])
    assert [x["hazard_id"] for x in m] == ["H1", "H2"]        # unknown node dropped
    assert m[0]["on_route"] is False and m[1]["on_route"] is True
    assert m[1]["position"]["z"] == 2.0                        # edge midpoint between floors
    assert m[0]["label"].startswith("Fire ·")


def test_snap_index_prefers_same_floor_nearest(building):
    nodes = ["F1_ENTRANCE_MAIN", "F1_CORRIDOR_CENTER", "F1_CORRIDOR_WEST", "F1_STAIR_A",
             "F2_STAIR_A", "F2_CORRIDOR_WEST", "F2_STUDIO_210"]
    assert snap_index(building, nodes, None) == 0
    assert snap_index(building, nodes, {"x": 13.0, "y": 10.5, "floor_id": "F2"}) == 5
    assert snap_index(building, nodes, {"x": 0.0, "y": 0.0, "floor_id": "B"}) == 0


# ---------------------------------------------------------------- packets

def test_responder_packet_shape(building):
    hz = [_hazard("H1", "fire", node_id="F2_CORRIDOR_EAST")]
    risk = {"F2_CORRIDOR_EAST": 1.0, "F2_CORRIDOR_CENTER": 0.8}
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", hazards=hz, risk=risk)
    unit = _entity("UNIT_ALPHA", "responder", "F1_ENTRANCE_MAIN", building)
    civ = _entity("CIV_001", "civilian", "F2_STUDIO_210", building)
    pk = build_packet(building, "responder", unit, route, hz, risk, destination_entity=civ)
    assert pk["persona"] == "responder" and pk["status"] == "candidate"
    assert pk["requires_command_approval"] is True and pk["provenance"] == "simulated"
    assert pk["coordinate_frame"] == "JACOBS_LOCAL"
    assert pk["destination"]["kind"] == "civilian"
    assert pk["destination"]["entity"]["entity_id"] == "CIV_001"
    assert len(pk["steps"]) == len(pk["nodes"]) - 1
    assert len(pk["polyline"]) == len(pk["nodes"])
    assert pk["render_path"][-1]["distance_along_m"] == pk["steps"][-1]["arrive_at_m"]
    assert {f["floor_id"] for f in pk["floors"] if f["on_route"]} == {"F1", "F2"}
    assert pk["zone_risk"]["F2_Z_CORRIDOR"] == 1.0
    assert pk["hazards"][0]["hazard_type"] == "fire"
    assert "safe" not in pk["disclaimer"].lower()


def test_responder_packet_snaps_to_position(building):
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", include_alternate=False)
    unit = _entity("UNIT_ALPHA", "responder", "F2_STAIR_A", building)
    pk = build_packet(building, "responder", unit, route)
    assert pk["nodes"][0] == "F2_STAIR_A"
    assert pk["progress"]["skipped_steps"] == 4
    assert pk["steps"][0]["index"] == 0 and pk["origin"]["node_id"] == "F2_STAIR_A"


def test_civilian_packet_has_exit_and_no_risk(building):
    civ = _entity("CIV_001", "civilian", "F2_STUDIO_210", building)
    evac = nearest_exit_route(building, "F2_STUDIO_210")
    pk = build_packet(building, "civilian", civ, evac, message="draft text",
                      responder_en_route=True)
    assert pk["destination"]["kind"] == "exit"
    assert pk["destination"]["node_id"] in building.entrance_nodes()
    assert pk["risk"] == {} and pk["zone_risk"] == {}
    assert pk["message"] == "draft text" and pk["responder_en_route"] is True
    assert pk["alternate_render_path"] == []


def test_packet_without_route_or_location(building):
    unit = _entity("UNIT_ALPHA", "responder", "F1_ENTRANCE_MAIN", building)
    pk = build_packet(building, "responder", unit, None)
    assert pk["status"] == "no_active_route" and pk["steps"] == [] and pk["floors"]
    civ = {"entity_id": "CIV_009", "entity_type": "civilian", "graph_node_id": None,
           "world_position": None, "flags": []}
    pk = build_packet(building, "civilian", civ, None)
    assert pk["status"] == "no_location"


def test_unreachable_packet_keeps_reason(building):
    hz = [_hazard("H1", "blocked", node_id="F2_STAIR_A", verified=True),
          _hazard("H2", "blocked", node_id="F2_STAIR_B", verified=True)]
    route = compute_route(building, "F1_ENTRANCE_MAIN", "F2_STUDIO_210", hazards=hz)
    unit = _entity("UNIT_ALPHA", "responder", "F1_ENTRANCE_MAIN", building)
    pk = build_packet(building, "responder", unit, route, hz)
    assert pk["status"] == "unreachable" and pk["unreachable_reason"]
    assert pk["render_path"] == [] and pk["origin"]["node_id"] == "F1_ENTRANCE_MAIN"
