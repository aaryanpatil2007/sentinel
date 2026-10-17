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


def _seed_310(client):
    body = {"text": "Studio 310, smoke is coming under the door."}
    return client.post("/civilians/report", json=body).json()["civilian"]["entity_id"]


def test_incident_reset_clears_everything(client):
    _seed_310(client)
    client.post("/spread/ignite", json={"node_id": "F2_CORRIDOR_EAST"})
    assert client.post("/incident/reset").json() == {"reset": True}
    state = client.get("/incident/state").json()
    assert state["entities"] == []
    assert state["hazards"] == []
    assert state["routes"] == []
    assert state["last_event_seq"] == 0
    assert client.get("/spread/prediction").json()["fire_nodes"] == []
    assert _seed_310(client) == "CIV_001"


def test_civilian_evacuation_returns_route_without_side_effects(client):
    cid = _seed_310(client)
    before = client.get("/incident/state").json()
    route = client.get(f"/civilians/{cid}/evacuation").json()
    assert route["route_id"] == f"EVAC_{cid}"
    assert route["status"] == "candidate"
    assert route["nodes"][0] == "F3_STUDIO_310"
    assert route["nodes"][-1] in {"F1_ENTRANCE_MAIN", "F1_ENTRANCE_EAST"}
    after = client.get("/incident/state").json()
    assert after["routes"] == []
    assert after["last_event_seq"] == before["last_event_seq"]


def test_civilian_evacuation_errors(client):
    assert client.get("/civilians/CIV_999/evacuation").status_code == 404
    cid = client.post("/civilians", json={}).json()["entity_id"]
    assert client.get(f"/civilians/{cid}/evacuation").json() == {"status": "no_location"}


def test_civilian_location_moves_civilian(client):
    cid = _seed_310(client)
    moved = client.post("/civilians/location",
                        json={"civilian_id": cid, "graph_node_id": "EXT_STAGING"}).json()
    assert moved["graph_node_id"] == "EXT_STAGING"
    assert moved["world_position"]["floor_id"] == "F1"
    missing = client.post("/civilians/location",
                          json={"civilian_id": "CIV_999", "graph_node_id": "EXT_STAGING"})
    assert missing.status_code == 404
    bad_node = client.post("/civilians/location",
                           json={"civilian_id": cid, "graph_node_id": "NOPE"})
    assert bad_node.status_code == 400
