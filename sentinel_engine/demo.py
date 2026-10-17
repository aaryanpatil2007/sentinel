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
        print("ERROR: route did not change")
        return 1

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
