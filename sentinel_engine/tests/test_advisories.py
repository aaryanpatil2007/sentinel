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
