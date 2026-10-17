"""Drafts civilian advisory messages. Drafts only — the incident commander
approves and sends; nothing here promises safety."""
from __future__ import annotations

from datetime import datetime, timezone

from .building import Building


def _floor_of(civilian: dict) -> str | None:
    wp = civilian.get("world_position") or {}
    return wp.get("floor_id")


def compose_advisory(civilian: dict, hazards: list[dict], evac_route: dict | None,
                     building: Building, responder_en_route: bool = False) -> dict:
    floor = _floor_of(civilian)
    on_floor = [h for h in hazards
                if h.get("node_id") and building.nodes[h["node_id"]].floor_id == floor]

    parts: list[str] = []
    if on_floor:
        types = sorted({h["hazard_type"].capitalize() for h in on_floor})
        parts.append(f"{' and '.join(types)} has been reported on your floor ({floor}).")
    else:
        parts.append(f"No hazards are currently reported on your floor ({floor}).")

    if evac_route and evac_route["status"] == "candidate":
        instructions = " Then ".join(s["instruction"] for s in evac_route["steps"])
        exit_label = building.nodes[evac_route["nodes"][-1]].label
        parts.append("Recommended evacuation (pending command approval): "
                     f"{instructions}. You will exit at {exit_label}.")
    else:
        parts.append("Please remain where you are; responders have your location report.")

    if responder_en_route:
        parts.append("A responder team has been assigned to review your situation.")

    return {"civilian_id": civilian["entity_id"], "message": " ".join(parts),
            "requires_command_approval": True,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "based_on": {"hazard_ids": [h["hazard_id"] for h in on_floor],
                         "route_id": evac_route["route_id"] if evac_route else None,
                         "responder_en_route": responder_en_route}}
