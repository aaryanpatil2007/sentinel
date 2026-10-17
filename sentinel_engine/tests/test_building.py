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
