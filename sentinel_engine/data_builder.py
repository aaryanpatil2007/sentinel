"""Builds the illustrative Jacobs Hall model. ALL GEOMETRY IS SIMULATED.

Floor count, room naming style (numbered studios, makerspace labs) informed by
the public Jacobs Institute "our spaces at a glance" description. Coordinates,
distances, stair/entrance placement are illustrative, not surveyed.
"""
import json
import math
from pathlib import Path

DATA_PATH = Path(__file__).parent / "data" / "jacobs_hall.json"

FLOORS = [
    {"floor_id": "B", "name": "Basement", "elevation_m": -4.0},
    {"floor_id": "F1", "name": "Floor 1", "elevation_m": 0.0},
    {"floor_id": "F2", "name": "Floor 2", "elevation_m": 4.0},
    {"floor_id": "F3", "name": "Floor 3", "elevation_m": 8.0},
]

# Room names verified against the official Jacobs Institute "our spaces at a
# glance" page (jacobsinstitute.berkeley.edu). Positions remain illustrative.
ROOMS = {  # floor -> [(suffix, label, x, y)]
    "B": [("STUDIO_10", "Studio 10", 12, 16), ("METAL_SHOP", "Metal Shop", 28, 16)],
    "F1": [("STUDIO_110", "Studio 110", 12, 16), ("STUDIO_120", "Studio 120", 28, 16)],
    "F2": [("STUDIO_210", "Studio 210", 12, 16), ("STUDIO_220", "Studio 220", 28, 16)],
    "F3": [("STUDIO_310", "Studio 310", 12, 16), ("PROTOTYPING_LAB", "Advanced Prototyping Lab", 28, 16)],
}


def _dist(a, b):
    return round(math.dist((a["x"], a["y"], a["z"]), (b["x"], b["y"], b["z"])), 1)


def build_jacobs_hall() -> dict:
    nodes, edges = [], []

    def add_node(node_id, floor_id, node_type, label, x, y, z):
        nodes.append({"node_id": node_id, "floor_id": floor_id, "node_type": node_type,
                      "label": label, "x": float(x), "y": float(y), "z": float(z)})

    def add_edge(a, b, edge_type):
        na = next(n for n in nodes if n["node_id"] == a)
        nb = next(n for n in nodes if n["node_id"] == b)
        edges.append({"edge_id": f"E{len(edges):03d}", "from_node": a, "to_node": b,
                      "distance_m": _dist(na, nb), "edge_type": edge_type})

    for f in FLOORS:
        fid, z = f["floor_id"], f["elevation_m"]
        add_node(f"{fid}_STAIR_A", fid, "stairs", f"West Stairwell ({fid})", 5, 10, z)
        add_node(f"{fid}_STAIR_B", fid, "stairs", f"East Stairwell ({fid})", 35, 10, z)
        add_node(f"{fid}_ELEVATOR", fid, "elevator", f"Elevator ({fid})", 20, 12, z)
        for side, x in [("WEST", 12), ("CENTER", 20), ("EAST", 28)]:
            add_node(f"{fid}_CORRIDOR_{side}", fid, "corridor", f"{side.title()} Corridor ({fid})", x, 10, z)
        for suffix, label, x, y in ROOMS[fid]:
            add_node(f"{fid}_{suffix}", fid, "room", label, x, y, z)
        add_edge(f"{fid}_CORRIDOR_WEST", f"{fid}_CORRIDOR_CENTER", "corridor")
        add_edge(f"{fid}_CORRIDOR_CENTER", f"{fid}_CORRIDOR_EAST", "corridor")
        add_edge(f"{fid}_STAIR_A", f"{fid}_CORRIDOR_WEST", "doorway")
        add_edge(f"{fid}_STAIR_B", f"{fid}_CORRIDOR_EAST", "doorway")
        add_edge(f"{fid}_ELEVATOR", f"{fid}_CORRIDOR_CENTER", "doorway")
        add_edge(f"{fid}_{ROOMS[fid][0][0]}", f"{fid}_CORRIDOR_WEST", "doorway")
        add_edge(f"{fid}_{ROOMS[fid][1][0]}", f"{fid}_CORRIDOR_EAST", "doorway")

    for lower, upper in zip(FLOORS, FLOORS[1:]):
        for stair in ("STAIR_A", "STAIR_B"):
            add_edge(f"{lower['floor_id']}_{stair}", f"{upper['floor_id']}_{stair}", "stairs")
        add_edge(f"{lower['floor_id']}_ELEVATOR", f"{upper['floor_id']}_ELEVATOR", "elevator")

    add_node("F1_ENTRANCE_MAIN", "F1", "entrance", "Main Entrance", 20, 0, 0.0)
    add_node("F1_ENTRANCE_EAST", "F1", "entrance", "East Entrance", 35, 0, 0.0)
    add_node("EXT_STAGING", "F1", "staging", "Exterior Staging Area", 20, -10, 0.0)
    add_edge("F1_ENTRANCE_MAIN", "F1_CORRIDOR_CENTER", "exterior_door")
    add_edge("F1_ENTRANCE_EAST", "F1_CORRIDOR_EAST", "exterior_door")
    add_edge("EXT_STAGING", "F1_ENTRANCE_MAIN", "exterior_door")

    return {
        "building_id": "jacobs_hall",
        "coordinate_frame": "JACOBS_LOCAL",
        "origin_description": "Illustrative southwest ground-floor corner; x east, y north, z up, meters.",
        "provenance": "simulated",
        "source_note": ("Verified from public sources: 3 stories + basement, two main F1 entrances, "
                        "room names (Studios 10/110/120/210/220/310, Metal Shop, Advanced Prototyping "
                        "Lab) per the official Jacobs Institute spaces page; ~41m x ~24m footprint on "
                        "an east-west axis per OpenStreetMap (way 440146220, 2530 Ridge Rd). "
                        "All coordinates, corridor layout, and stair/entrance placement are illustrative."),
        "floors": FLOORS,
        "nodes": nodes,
        "edges": edges,
    }


if __name__ == "__main__":
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    DATA_PATH.write_text(json.dumps(build_jacobs_hall(), indent=2))
    print(f"wrote {DATA_PATH}")
