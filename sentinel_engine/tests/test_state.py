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
