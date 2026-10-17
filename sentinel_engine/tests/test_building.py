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


def test_zones_cover_every_node_exactly_once(building):
    assert building.zones
    for n in building.nodes.values():
        zone = building.zone_for(n.node_id)
        assert zone is not None, n.node_id
        assert zone["floor_id"] == n.floor_id
        assert zone["x_min"] <= n.x <= zone["x_max"] and zone["y_min"] <= n.y <= zone["y_max"]


def test_zones_do_not_overlap_on_a_floor(building):
    zones = list(building.zones.values())
    for i, a in enumerate(zones):
        for b in zones[i + 1:]:
            if a["floor_id"] != b["floor_id"]:
                continue
            ox = min(a["x_max"], b["x_max"]) - max(a["x_min"], b["x_min"])
            oy = min(a["y_max"], b["y_max"]) - max(a["y_min"], b["y_min"])
            assert not (ox > 1e-6 and oy > 1e-6), (a["zone_id"], b["zone_id"])


def test_building_without_zones_still_loads():
    data = Building.load().to_dict()
    b = Building({k: v for k, v in data.items() if k != "zones"})
    assert b.zones == {} and b.zone_for("F2_STUDIO_210") is None
