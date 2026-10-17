"""Hazard-aware Dijkstra routing with 3D polylines and AR guidance steps."""
from __future__ import annotations

import heapq
import math

from .building import Building

DEFAULT_WEIGHTS = {"smoke_penalty": 4.0, "unverified_hazard_penalty": 1.5,
                   "uncertainty_penalty": 0.5, "risk_lambda": 8.0}

BASE_ASSUMPTIONS = ["Illustrative simulated building geometry",
                    "Graph cost is not a safety guarantee; command approval required"]


def edge_costs(building: Building, hazards=(), risk: dict | None = None,
               weights: dict | None = None) -> dict[str, float | None]:
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    risk = risk or {}
    node_h: dict[str, list] = {}
    edge_h: dict[str, list] = {}
    for h in hazards:
        if h.get("node_id"):
            node_h.setdefault(h["node_id"], []).append(h)
        if h.get("edge_id"):
            edge_h.setdefault(h["edge_id"], []).append(h)

    costs: dict[str, float | None] = {}
    for eid, e in building.edges.items():
        if e.edge_type == "elevator":
            costs[eid] = None
            continue
        hs = edge_h.get(eid, []) + node_h.get(e.from_node, []) + node_h.get(e.to_node, [])
        if any(h["hazard_type"] in ("fire", "blocked") and h["verified"] for h in hs):
            costs[eid] = None
            continue
        mult = 1.0
        if any(h["hazard_type"] == "smoke" for h in hs):
            mult += w["smoke_penalty"]
        if any(h["hazard_type"] in ("fire", "blocked") and not h["verified"] for h in hs):
            mult += w["unverified_hazard_penalty"] + w["uncertainty_penalty"]
        edge_risk = max(risk.get(e.from_node, 0.0), risk.get(e.to_node, 0.0))
        mult += w["risk_lambda"] * edge_risk
        costs[eid] = e.distance_m * mult
    return costs


def _dijkstra(building: Building, costs, start, dest):
    dist = {start: 0.0}
    prev: dict[str, tuple[str, str]] = {}
    pq = [(0.0, start)]
    while pq:
        d, node = heapq.heappop(pq)
        if d > dist.get(node, math.inf):
            continue
        if node == dest:
            break
        for edge_id, nbr in building.adjacency[node]:
            c = costs.get(edge_id)
            if c is None:
                continue
            nd = d + c
            if nd < dist.get(nbr, math.inf):
                dist[nbr] = nd
                prev[nbr] = (node, edge_id)
                heapq.heappush(pq, (nd, nbr))
    if dest not in dist:
        return None, None, None
    nodes, edges = [dest], []
    while nodes[-1] != start:
        p, eid = prev[nodes[-1]]
        nodes.append(p)
        edges.append(eid)
    return list(reversed(nodes)), list(reversed(edges)), dist[dest]


def _steps(building: Building, nodes: list[str]) -> list[dict]:
    steps = []
    for a, b in zip(nodes, nodes[1:]):
        na, nb = building.nodes[a], building.nodes[b]
        dx, dy, dz = nb.x - na.x, nb.y - na.y, nb.z - na.z
        flat = math.hypot(dx, dy)
        bearing = (math.degrees(math.atan2(dx, dy)) + 360) % 360
        if nb.floor_id != na.floor_id:
            instruction = f"Take stairs {'up' if dz > 0 else 'down'} to {nb.label}"
        else:
            instruction = f"Proceed {flat:.0f} m to {nb.label}"
        steps.append({"instruction": instruction, "to_node": b,
                      "waypoint": building.node_position(b),
                      "distance_m": round(flat if flat else abs(dz), 1),
                      "bearing_degrees": round(bearing, 1)})
    return steps


def _route_dict(building, route_id, start, dest, nodes, edge_ids, cost, hazards):
    polyline = [building.node_position(n) for n in nodes]
    distance = round(sum(building.edges[e].distance_m for e in edge_ids), 1)
    return {"route_id": route_id, "status": "candidate", "start_node": start,
            "destination_node": dest, "nodes": nodes, "edge_ids": edge_ids,
            "polyline": polyline, "steps": _steps(building, nodes),
            "total_distance_m": distance, "total_cost": round(cost, 1),
            "hazards_considered": [h["hazard_id"] for h in hazards],
            "assumptions": list(BASE_ASSUMPTIONS),
            "requires_command_approval": True, "unreachable_reason": None,
            "alternate": None}


def _unreachable(route_id, start, dest, hazards):
    blocking = [h["hazard_id"] for h in hazards if h.get("verified")]
    return {"route_id": route_id, "status": "unreachable", "start_node": start,
            "destination_node": dest, "nodes": [], "edge_ids": [], "polyline": [],
            "steps": [], "total_distance_m": 0.0, "total_cost": 0.0,
            "hazards_considered": [h["hazard_id"] for h in hazards],
            "assumptions": list(BASE_ASSUMPTIONS), "requires_command_approval": True,
            "unreachable_reason": ("No traversable path; blocking hazards: "
                                   f"{blocking or 'graph disconnection'}"),
            "alternate": None}


def compute_route(building: Building, start_node: str, destination_node: str,
                  hazards=(), risk: dict | None = None, weights: dict | None = None,
                  route_id: str = "ROUTE_001", include_alternate: bool = True) -> dict:
    hazards = list(hazards)
    costs = edge_costs(building, hazards, risk, weights)
    nodes, edge_ids, cost = _dijkstra(building, costs, start_node, destination_node)
    if nodes is None:
        return _unreachable(route_id, start_node, destination_node, hazards)
    route = _route_dict(building, route_id, start_node, destination_node,
                        nodes, edge_ids, cost, hazards)
    if include_alternate:
        penalized = dict(costs)
        for eid in edge_ids:
            if penalized[eid] is not None:
                penalized[eid] *= 3.0
        alt_nodes, alt_edges, alt_cost = _dijkstra(building, penalized,
                                                   start_node, destination_node)
        if alt_nodes and alt_nodes != nodes:
            # recost the alternate path with the true (unpenalized) costs
            true_cost = sum(costs[e] for e in alt_edges)
            route["alternate"] = _route_dict(building, route_id + "_ALT", start_node,
                                             destination_node, alt_nodes, alt_edges,
                                             true_cost, hazards)
    return route


def nearest_exit_route(building: Building, from_node: str, hazards=(),
                       risk: dict | None = None, weights: dict | None = None,
                       route_id: str = "EVAC_001") -> dict:
    best = None
    for exit_node in building.entrance_nodes():
        r = compute_route(building, from_node, exit_node, hazards, risk, weights,
                          route_id=route_id, include_alternate=False)
        if r["status"] == "candidate" and (best is None or r["total_cost"] < best["total_cost"]):
            best = r
    return best or _unreachable(route_id, from_node, "any_exit", list(hazards))
