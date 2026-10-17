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
