"""Building spatial model: nodes, edges, coordinate frame, location resolution."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

DEFAULT_DATA_PATH = Path(__file__).parent / "data" / "jacobs_hall.json"

FLOOR_WORDS = {
    "basement": "B",
    "first floor": "F1", "floor 1": "F1", "floor one": "F1", "1st floor": "F1", "ground floor": "F1",
    "second floor": "F2", "floor 2": "F2", "floor two": "F2", "2nd floor": "F2",
    "third floor": "F3", "floor 3": "F3", "floor three": "F3", "3rd floor": "F3",
}


@dataclass(frozen=True)
class Node:
    node_id: str
    floor_id: str
    node_type: str
    label: str
    x: float
    y: float
    z: float


@dataclass(frozen=True)
class Edge:
    edge_id: str
    from_node: str
    to_node: str
    distance_m: float
    edge_type: str


class Building:
    def __init__(self, data: dict):
        self._data = data
        self.building_id = data["building_id"]
        self.coordinate_frame = data["coordinate_frame"]
        self.floors = data["floors"]
        self.nodes = {n["node_id"]: Node(**n) for n in data["nodes"]}
        self.edges = {e["edge_id"]: Edge(**e) for e in data["edges"]}
        # Zones: drawable footprints (rooms, corridors, stairwells, lobbies).
        # Optional — synthetic training buildings have none.
        self.zones: dict[str, dict] = {z["zone_id"]: z for z in data.get("zones", [])}
        self.zone_of_node: dict[str, str] = {}
        for z in self.zones.values():
            for nid in z["node_ids"]:
                if nid not in self.nodes:
                    raise ValueError(f"zone {z['zone_id']} references unknown node {nid}")
                if nid in self.zone_of_node:
                    raise ValueError(f"node {nid} belongs to more than one zone")
                self.zone_of_node[nid] = z["zone_id"]
        self.adjacency: dict[str, list[tuple[str, str]]] = {nid: [] for nid in self.nodes}
        for e in self.edges.values():
            if e.from_node not in self.nodes or e.to_node not in self.nodes:
                raise ValueError(f"edge {e.edge_id} references unknown node")
            self.adjacency[e.from_node].append((e.edge_id, e.to_node))
            self.adjacency[e.to_node].append((e.edge_id, e.from_node))

    @classmethod
    def load(cls, path: str | Path | None = None) -> "Building":
        return cls(json.loads(Path(path or DEFAULT_DATA_PATH).read_text()))

    def to_dict(self) -> dict:
        return self._data

    def node_position(self, node_id: str) -> dict:
        n = self.nodes[node_id]
        return {"x": n.x, "y": n.y, "z": n.z, "floor_id": n.floor_id,
                "coordinate_frame": self.coordinate_frame}

    def zone_for(self, node_id: str) -> dict | None:
        zid = self.zone_of_node.get(node_id)
        return self.zones.get(zid) if zid else None

    def entrance_nodes(self) -> list[str]:
        return [n.node_id for n in self.nodes.values() if n.node_type == "entrance"]

    def resolve_location(self, text: str, default_floor: str | None = None) -> dict | None:
        t = text.lower()
        floor = default_floor
        for phrase, fid in FLOOR_WORDS.items():
            if phrase in t:
                floor = fid
                break

        # Room number, e.g. "210" / "studio 310": leading digit implies floor.
        m = re.search(r"\b([1-3])\d{2}\b", t)
        if m:
            number = m.group(0)
            for n in self.nodes.values():
                if n.node_type == "room" and number in n.label:
                    conflict = None
                    if floor and floor != n.floor_id:
                        conflict = (f"room {number} is on {n.floor_id} but report says {floor}; "
                                    "using room, flagged for review")
                    return {"node_id": n.node_id, "floor_id": n.floor_id,
                            "match_type": "room_number", "matched_text": number,
                            "conflict": conflict}

        # Room label substring, e.g. "wood shop", "electronics lab".
        for n in self.nodes.values():
            if n.node_type == "room" and n.label.lower() in t:
                return {"node_id": n.node_id, "floor_id": n.floor_id,
                        "match_type": "room_label", "matched_text": n.label, "conflict": None}

        # Stairwells / corridors, qualified by side; needs a floor to pick a node.
        side_map = {"east": "B", "west": "A"}
        for side, letter in side_map.items():
            if f"{side} stair" in t and floor:
                nid = f"{floor}_STAIR_{letter}"
                if nid in self.nodes:
                    return {"node_id": nid, "floor_id": floor, "match_type": "stairwell",
                            "matched_text": f"{side} stairwell", "conflict": None}
        for side in ("west", "center", "east"):
            if f"{side} corridor" in t and floor:
                nid = f"{floor}_CORRIDOR_{side.upper()}"
                if nid in self.nodes:
                    return {"node_id": nid, "floor_id": floor, "match_type": "corridor",
                            "matched_text": f"{side} corridor", "conflict": None}

        # Floor-only mention: anchor to that floor's center corridor, low precision.
        if floor:
            nid = f"{floor}_CORRIDOR_CENTER"
            if nid in self.nodes:
                return {"node_id": nid, "floor_id": floor, "match_type": "floor_only",
                        "matched_text": floor, "conflict": None}
        return None
