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
