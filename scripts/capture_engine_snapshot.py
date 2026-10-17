"""Record a seeded engine incident to src/data/engine-snapshot.json (the app's offline fallback).

Run from the repo root:  PYTHONPATH=. .venv/bin/python scripts/capture_engine_snapshot.py
Replays the same seed sequence as the app's engine slice (seed()).
"""
from __future__ import annotations

import json
from pathlib import Path

from fastapi.testclient import TestClient

from sentinel_engine.api import create_app

ROOT = Path(__file__).resolve().parent.parent
SCENARIO = json.loads((ROOT / "src/data/scenario.json").read_text())
OUT = ROOT / "src/data/engine-snapshot.json"


def seed(client: TestClient) -> None:
    client.post("/incident/reset")
    for resident in SCENARIO["residents"]:
        client.post("/civilians/report", json={"text": resident["text"]})
    for responder in SCENARIO["responders"]:
        client.post("/responders", json={"responder_id": responder["id"],
                                         "name": responder["name"],
                                         "graph_node_id": responder["node"]})
    for node in SCENARIO["ignite"]:
        client.post("/spread/ignite", json={"node_id": node})
    for hazard in SCENARIO["hazards"]:
        client.post("/hazards", json={"hazard_type": hazard["type"], "node_id": hazard["node"],
                                      "verified": True, "source": "responder_report"})
    recommendations = client.post("/rescue/prioritize").json()["recommendations"]
    for responder, rec in zip(SCENARIO["responders"], recommendations):
        client.post("/routes/compute", json={"responder_id": responder["id"],
                                             "civilian_id": rec["civilian_id"],
                                             "route_id": f"RESCUE_{responder['id']}"})


def main() -> None:
    client = TestClient(create_app())
    seed(client)
    state = client.get("/incident/state").json()
    civilians = [e["entity_id"] for e in state["entities"] if e["entity_type"] == "civilian"]
    evacuations = {}
    for cid in civilians:
        route = client.get(f"/civilians/{cid}/evacuation").json()
        evacuations[cid] = route if "route_id" in route else None
    snapshot = {
        "graph": client.get("/building/graph").json(),
        "prediction": client.get("/spread/prediction").json(),
        "recommendations": client.post("/rescue/prioritize").json()["recommendations"],
        "evacuations": evacuations,
        "advisories": {cid: client.get(f"/civilians/{cid}/advisory").json() for cid in civilians},
        "state": client.get("/incident/state").json(),
    }
    OUT.write_text(json.dumps(snapshot, indent=1) + "\n")
    print(f"wrote {OUT.relative_to(ROOT)}: {len(civilians)} civilians")


if __name__ == "__main__":
    main()
