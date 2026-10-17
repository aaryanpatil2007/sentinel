"""In-memory shared incident state with append-only event log."""
from __future__ import annotations

from datetime import datetime, timezone

from .building import Building

ID_PREFIX = {"civilian": "CIV", "responder": "UNIT", "detected_person": "DET"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class IncidentState:
    def __init__(self, building: Building):
        self.building = building
        self.entities: dict[str, dict] = {}
        self.hazards: dict[str, dict] = {}
        self.routes: dict[str, dict] = {}
        self.events: list[dict] = []
        self._counters: dict[str, int] = {}

    def reset(self) -> None:
        """Clear everything in place (demo control). In-place so closures that
        captured this state object keep working."""
        self.entities.clear()
        self.hazards.clear()
        self.routes.clear()
        self.events.clear()
        self._counters.clear()

    def _next_id(self, prefix: str) -> str:
        self._counters[prefix] = self._counters.get(prefix, 0) + 1
        return f"{prefix}_{self._counters[prefix]:03d}"

    def append_event(self, event_type: str, payload: dict) -> dict:
        event = {"seq": len(self.events) + 1, "timestamp": _now(),
                 "event_type": event_type, "payload": payload}
        self.events.append(event)
        return event

    def events_since(self, seq: int) -> list[dict]:
        return [e for e in self.events if e["seq"] > seq]

    def _apply_location(self, entity: dict, world_position, graph_node_id,
                        source: str, position_status: str) -> None:
        if graph_node_id is not None and world_position is None:
            world_position = self.building.node_position(graph_node_id)
            flag = "position is node anchor, not exact"
            if flag not in entity["flags"]:
                entity["flags"].append(flag)
        entity.update(world_position=world_position, graph_node_id=graph_node_id,
                      source=source, position_status=position_status, last_updated=_now())

    def register_entity(self, entity_type: str, entity_id: str | None = None,
                        name: str | None = None, world_position: dict | None = None,
                        graph_node_id: str | None = None, source: str = "manual",
                        position_status: str = "unknown") -> dict:
        entity_id = entity_id or self._next_id(ID_PREFIX[entity_type])
        entity = {"entity_id": entity_id, "entity_type": entity_type, "name": name,
                  "world_position": None, "graph_node_id": None, "source": source,
                  "position_status": position_status, "last_updated": _now(),
                  "report": None, "priority": None, "flags": []}
        if world_position or graph_node_id:
            self._apply_location(entity, world_position, graph_node_id, source, position_status)
        self.entities[entity_id] = entity
        self.append_event("entity_registered", {"entity_id": entity_id, "entity_type": entity_type})
        return entity

    def update_entity_location(self, entity_id: str, world_position: dict | None = None,
                               graph_node_id: str | None = None, source: str = "manual",
                               position_status: str = "reported") -> dict:
        entity = self.entities[entity_id]
        self._apply_location(entity, world_position, graph_node_id, source, position_status)
        self.append_event("entity_location_updated",
                          {"entity_id": entity_id, "graph_node_id": graph_node_id})
        return entity

    def get_entities(self, entity_type: str | None = None) -> list[dict]:
        return [e for e in self.entities.values()
                if entity_type is None or e["entity_type"] == entity_type]

    def get_entity(self, entity_id: str) -> dict | None:
        return self.entities.get(entity_id)

    def add_hazard(self, hazard_type: str, node_id: str | None = None,
                   edge_id: str | None = None, verified: bool = False,
                   source: str = "manual", description: str = "") -> dict:
        hazard = {"hazard_id": self._next_id("HAZ"), "hazard_type": hazard_type,
                  "node_id": node_id, "edge_id": edge_id, "verified": verified,
                  "source": source, "description": description, "created_at": _now()}
        self.hazards[hazard["hazard_id"]] = hazard
        self.append_event("hazard_added", hazard)
        return hazard

    def remove_hazard(self, hazard_id: str) -> bool:
        hazard = self.hazards.pop(hazard_id, None)
        if hazard:
            self.append_event("hazard_removed", {"hazard_id": hazard_id})
        return hazard is not None

    def get_hazards(self) -> list[dict]:
        return list(self.hazards.values())

    def set_route(self, route: dict, meta: dict) -> None:
        self.routes[route["route_id"]] = {**route, "meta": meta}

    def get_routes(self) -> list[dict]:
        return list(self.routes.values())

    def snapshot(self) -> dict:
        return {"building_id": self.building.building_id,
                "coordinate_frame": self.building.coordinate_frame,
                "timestamp": _now(),
                "entities": list(self.entities.values()),
                "hazards": list(self.hazards.values()),
                "routes": self.get_routes(),
                "last_event_seq": len(self.events)}
