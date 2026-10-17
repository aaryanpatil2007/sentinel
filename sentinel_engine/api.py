"""FastAPI adapter over the Sentinel intelligence engine."""
from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .advisories import compose_advisory
from .building import Building
from .routing import compute_route, nearest_exit_route
from .spread import MonteCarloPredictor, SurrogatePredictor
from .state import IncidentState
from .triage import extract_report, prioritize


class ObservationIn(BaseModel):
    observation_id: str
    type: str
    world_position: dict
    graph_node_id: str
    camera_id: str
    confidence: float
    source: str = "simulated_camera"
    position_status: str = "simulated"
    provenance: str = "simulated"
    timestamp: str | None = None


class CivilianIn(BaseModel):
    name: str | None = None


class CivilianReportIn(BaseModel):
    civilian_id: str | None = None
    text: str


class ResponderIn(BaseModel):
    responder_id: str | None = None
    name: str | None = None
    graph_node_id: str | None = None


class ResponderLocationIn(BaseModel):
    responder_id: str
    graph_node_id: str | None = None
    world_position: dict | None = None
    text: str | None = None


class HazardIn(BaseModel):
    hazard_type: str
    node_id: str | None = None
    edge_id: str | None = None
    text: str | None = None
    default_floor: str | None = None
    verified: bool = False
    source: str = "manual"
    description: str = ""


class RouteRequest(BaseModel):
    start_node: str | None = None
    responder_id: str | None = None
    destination_node: str | None = None
    civilian_id: str | None = None
    route_id: str | None = None


class IgniteIn(BaseModel):
    node_id: str


def _current_risk(app: FastAPI) -> dict:
    if not app.state.fire_nodes:
        return {}
    if app.state.predictor:
        return app.state.predictor.predict(app.state.building, app.state.fire_nodes)
    return app.state.mc.predict(app.state.fire_nodes)


def _recompute_routes(app: FastAPI) -> None:
    incident: IncidentState = app.state.incident
    risk = _current_risk(app)
    hazards = incident.get_hazards()
    for stored in list(incident.routes.values()):
        meta = stored["meta"]
        new = compute_route(app.state.building, stored["start_node"],
                            stored["destination_node"], hazards=hazards, risk=risk,
                            route_id=stored["route_id"])
        if new["nodes"] != stored["nodes"] or new["status"] != stored["status"]:
            incident.set_route(new, meta)
            incident.append_event("route_updated",
                                  {"route_id": new["route_id"], "reason": "hazard_change",
                                   "status": new["status"]})


def _node_of(app: FastAPI, entity_id: str, role: str) -> str:
    entity = app.state.incident.get_entity(entity_id)
    if entity is None:
        raise HTTPException(404, f"{role} {entity_id} not found")
    if not entity.get("graph_node_id"):
        raise HTTPException(400, f"{role} {entity_id} has no known graph node")
    return entity["graph_node_id"]


def create_app(building_path=None) -> FastAPI:
    app = FastAPI(title="Sentinel Intelligence Engine",
                  description="Decision-support prototype. All geometry and "
                              "dynamics are simulated; humans approve all actions.")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"],
                       allow_headers=["*"])
    app.state.building = Building.load(building_path)
    app.state.incident = IncidentState(app.state.building)
    app.state.fire_nodes = set()
    app.state.predictor = SurrogatePredictor.load()
    app.state.mc = MonteCarloPredictor(app.state.building)

    building: Building = app.state.building
    incident: IncidentState = app.state.incident

    @app.get("/health")
    def health():
        return {"status": "ok", "building_id": building.building_id,
                "surrogate_loaded": app.state.predictor is not None}

    @app.get("/building")
    def get_building():
        return building.to_dict()

    @app.get("/building/graph")
    def get_graph():
        d = building.to_dict()
        return {"nodes": d["nodes"], "edges": d["edges"]}

    @app.get("/spatial/coordinate-system")
    def coordinate_system():
        d = building.to_dict()
        return {"coordinate_frame": building.coordinate_frame,
                "origin_description": d["origin_description"],
                "axes": {"x": "east (m)", "y": "north (m)", "z": "up (m)"},
                "floors": building.floors, "provenance": "simulated"}

    @app.post("/observations")
    def ingest_observation(obs: ObservationIn):
        if obs.graph_node_id not in building.nodes:
            raise HTTPException(400, f"unknown node {obs.graph_node_id}")
        incident.append_event("observation_ingested", obs.model_dump())
        if obs.type == "person":
            entity = incident.register_entity(
                "detected_person", world_position=obs.world_position,
                graph_node_id=obs.graph_node_id, source=obs.source,
                position_status=obs.position_status)
            return entity
        hazard = incident.add_hazard(obs.type, node_id=obs.graph_node_id,
                                     verified=False, source=obs.source,
                                     description=f"camera {obs.camera_id}")
        if obs.type == "fire":
            app.state.fire_nodes.add(obs.graph_node_id)
        _recompute_routes(app)
        return hazard

    @app.post("/civilians")
    def create_civilian(body: CivilianIn):
        return incident.register_entity("civilian", name=body.name)

    @app.get("/civilians")
    def list_civilians():
        return incident.get_entities("civilian")

    @app.post("/civilians/report")
    def civilian_report(body: CivilianReportIn):
        civ = (incident.get_entity(body.civilian_id) if body.civilian_id
               else incident.register_entity("civilian"))
        if civ is None:
            raise HTTPException(404, f"civilian {body.civilian_id} not found")
        report = extract_report(body.text, building)
        priority = prioritize(report, risk=_current_risk(app))
        civ["report"] = report
        civ["priority"] = priority
        for flag in priority["flags"]:
            if flag not in civ["flags"]:
                civ["flags"].append(flag)
        if report["location"]:
            incident.update_entity_location(civ["entity_id"],
                                            graph_node_id=report["location"]["node_id"],
                                            source="civilian_report",
                                            position_status="reported")
        incident.append_event("civilian_report",
                              {"civilian_id": civ["entity_id"],
                               "priority": priority["priority"], "text": body.text})
        return {"civilian": civ, "report": report, "priority": priority}

    @app.get("/civilians/{civilian_id}/advisory")
    def civilian_advisory(civilian_id: str):
        civ = incident.get_entity(civilian_id)
        if civ is None:
            raise HTTPException(404, f"civilian {civilian_id} not found")
        evac = None
        if civ.get("graph_node_id"):
            evac = nearest_exit_route(building, civ["graph_node_id"],
                                      hazards=incident.get_hazards(),
                                      risk=_current_risk(app),
                                      route_id=f"EVAC_{civilian_id}")
        en_route = any(r["meta"].get("civilian_id") == civilian_id
                       for r in incident.get_routes())
        adv = compose_advisory(civ, incident.get_hazards(), evac, building,
                               responder_en_route=en_route)
        incident.append_event("advisory_drafted", {"civilian_id": civilian_id})
        return adv

    @app.get("/advisories")
    def all_advisories():
        return [civilian_advisory(c["entity_id"])
                for c in incident.get_entities("civilian") if c.get("graph_node_id")]

    @app.post("/responders")
    def create_responder(body: ResponderIn):
        return incident.register_entity("responder", entity_id=body.responder_id,
                                        name=body.name,
                                        graph_node_id=body.graph_node_id,
                                        source="responder_report",
                                        position_status="reported")

    @app.get("/responders")
    def list_responders():
        return incident.get_entities("responder")

    @app.post("/responders/location")
    def responder_location(body: ResponderLocationIn):
        node = body.graph_node_id
        if body.text and not node:
            resolved = building.resolve_location(body.text)
            if not resolved:
                raise HTTPException(400, f"could not resolve location: {body.text!r}")
            node = resolved["node_id"]
        if incident.get_entity(body.responder_id) is None:
            raise HTTPException(404, f"responder {body.responder_id} not found")
        return incident.update_entity_location(body.responder_id,
                                               world_position=body.world_position,
                                               graph_node_id=node,
                                               source="responder_report",
                                               position_status="reported")

    @app.get("/responders/{responder_id}/guidance")
    def guidance(responder_id: str):
        responder = incident.get_entity(responder_id)
        if responder is None:
            raise HTTPException(404, f"responder {responder_id} not found")
        route = next((r for r in incident.get_routes()
                      if r["meta"].get("responder_id") == responder_id), None)
        if route is None or route["status"] != "candidate":
            return {"status": "no_active_route"}
        # snap: nearest route node on the responder's floor, else route start
        start_idx = 0
        wp = responder.get("world_position")
        if wp:
            best = None
            for i, nid in enumerate(route["nodes"]):
                n = building.nodes[nid]
                if n.floor_id == wp["floor_id"]:
                    d = (n.x - wp["x"]) ** 2 + (n.y - wp["y"]) ** 2
                    if best is None or d < best[0]:
                        best = (d, i)
            if best:
                start_idx = best[1]
        return {"route_id": route["route_id"], "status": "candidate",
                "destination_node": route["destination_node"],
                "next_steps": route["steps"][start_idx:]}

    @app.post("/hazards")
    def add_hazard(body: HazardIn):
        node_id, edge_id = body.node_id, body.edge_id
        if body.text and not node_id and not edge_id:
            resolved = building.resolve_location(body.text, body.default_floor)
            if not resolved:
                raise HTTPException(400, f"could not resolve hazard location: {body.text!r}")
            node_id = resolved["node_id"]
        if not node_id and not edge_id:
            raise HTTPException(400, "hazard needs node_id, edge_id, or resolvable text")
        hazard = incident.add_hazard(body.hazard_type, node_id=node_id,
                                     edge_id=edge_id, verified=body.verified,
                                     source=body.source, description=body.description)
        if body.hazard_type == "fire" and node_id:
            app.state.fire_nodes.add(node_id)
        _recompute_routes(app)
        return hazard

    @app.get("/hazards")
    def list_hazards():
        return incident.get_hazards()

    @app.delete("/hazards/{hazard_id}")
    def delete_hazard(hazard_id: str):
        hazard = incident.hazards.get(hazard_id)
        if not incident.remove_hazard(hazard_id):
            raise HTTPException(404, f"hazard {hazard_id} not found")
        if hazard and hazard["hazard_type"] == "fire" and hazard["node_id"]:
            still_burning = any(h["hazard_type"] == "fire" and h["node_id"] == hazard["node_id"]
                                for h in incident.get_hazards())
            if not still_burning:
                app.state.fire_nodes.discard(hazard["node_id"])
        _recompute_routes(app)
        return {"removed": hazard_id}

    @app.post("/routes/compute")
    def routes_compute(body: RouteRequest):
        start = body.start_node or (_node_of(app, body.responder_id, "responder")
                                    if body.responder_id else None)
        dest = body.destination_node or (_node_of(app, body.civilian_id, "civilian")
                                         if body.civilian_id else None)
        if not start or not dest:
            raise HTTPException(400, "need start_node/responder_id and "
                                     "destination_node/civilian_id")
        if start not in building.nodes or dest not in building.nodes:
            raise HTTPException(400, "unknown start or destination node")
        route_id = body.route_id or f"ROUTE_{len(incident.routes) + 1:03d}"
        route = compute_route(building, start, dest, hazards=incident.get_hazards(),
                              risk=_current_risk(app), route_id=route_id)
        incident.set_route(route, {"responder_id": body.responder_id,
                                   "civilian_id": body.civilian_id})
        incident.append_event("route_computed",
                              {"route_id": route_id, "status": route["status"]})
        return route

    @app.get("/routes")
    def list_routes():
        return incident.get_routes()

    @app.get("/spread/prediction")
    def spread_prediction():
        fire = sorted(app.state.fire_nodes)
        if not fire:
            return {"fire_nodes": [], "horizon_minutes": 10, "method": "none",
                    "risk": {n: 0.0 for n in building.nodes}, "provenance": "simulated"}
        predictor = app.state.predictor or app.state.mc
        risk = _current_risk(app)
        return {"fire_nodes": fire, "horizon_minutes": 10,
                "method": predictor.method_name, "risk": risk,
                "provenance": "simulated"}

    @app.post("/spread/ignite")
    def ignite(body: IgniteIn):
        if body.node_id not in building.nodes:
            raise HTTPException(400, f"unknown node {body.node_id}")
        app.state.fire_nodes.add(body.node_id)
        incident.add_hazard("fire", node_id=body.node_id, verified=True,
                            source="demo_control", description="demo ignition")
        _recompute_routes(app)
        return spread_prediction()

    @app.post("/rescue/prioritize")
    def rescue_prioritize():
        risk = _current_risk(app)
        hazards = incident.get_hazards()
        recs = []
        civilians = [c for c in incident.get_entities("civilian") if c.get("priority")]
        for civ in sorted(civilians, key=lambda c: c["priority"]["score"], reverse=True):
            best = (None, None)
            if civ.get("graph_node_id"):
                for resp in incident.get_entities("responder"):
                    if not resp.get("graph_node_id"):
                        continue
                    r = compute_route(building, resp["graph_node_id"],
                                      civ["graph_node_id"], hazards=hazards,
                                      risk=risk, include_alternate=False)
                    if r["status"] == "candidate" and (best[1] is None
                                                       or r["total_cost"] < best[1]):
                        best = (resp["entity_id"], r["total_cost"])
            recs.append({"civilian_id": civ["entity_id"],
                         "priority": civ["priority"]["priority"],
                         "score": civ["priority"]["score"],
                         "reason": civ["priority"]["reason"],
                         "flags": civ["priority"]["flags"],
                         "nearest_responder_id": best[0],
                         "route_status": "candidate" if best[0] else "unreachable",
                         "estimated_cost": best[1],
                         "requires_command_approval": True})
        incident.append_event("rescue_prioritized", {"count": len(recs)})
        return {"recommendations": recs}

    @app.get("/incident/state")
    def incident_state():
        return incident.snapshot()

    @app.get("/incident/events")
    def incident_events(since: int = 0):
        return {"events": incident.events_since(since)}

    return app


app = create_app()
