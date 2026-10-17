"""Simulated graph-based fire spread + predictors. Plausible dynamics, NOT real
fire physics; everything produced here is labeled simulated."""
from __future__ import annotations

import random
from collections import deque
from pathlib import Path

from .building import Building

EDGE_OPENNESS = {"corridor": 0.9, "doorway": 0.5, "exterior_door": 0.3,
                 "stairs": 0.15, "elevator": 0.05}
TICK_SECONDS = 30
FEATURE_NAMES = ["hops_to_fire", "meters_to_fire", "same_floor_as_nearest_fire",
                 "min_openness_on_path", "degree", "in_smoke"]

SURROGATE_PATH = Path(__file__).parent / "data" / "spread_model.joblib"


class SpreadSimulator:
    def __init__(self, building: Building, base_rate: float = 0.35,
                 rng: random.Random | None = None):
        self.building = building
        self.base_rate = base_rate
        self.rng = rng or random.Random()

    def _spread_prob(self, edge_id: str) -> float:
        edge = self.building.edges[edge_id]
        openness = EDGE_OPENNESS[edge.edge_type]
        distance_factor = max(1.0, edge.distance_m / 10.0)
        return min(0.95, self.base_rate * openness / distance_factor)

    def rollout(self, fire_nodes: set[str], ticks: int) -> set[str]:
        burning = set(fire_nodes)
        for _ in range(ticks):
            new = set()
            for node in burning:
                for edge_id, nbr in self.building.adjacency[node]:
                    if nbr not in burning and self.rng.random() < self._spread_prob(edge_id):
                        new.add(nbr)
            burning |= new
        return burning

    def smoke_front(self, fire_nodes: set[str]) -> set[str]:
        smoke = set(fire_nodes)
        for node in fire_nodes:
            smoke.update(nbr for _, nbr in self.building.adjacency[node])
        return smoke


class MonteCarloPredictor:
    method_name = "monte_carlo_simulated"

    def __init__(self, building: Building, base_rate: float = 0.35):
        self.building = building
        self.base_rate = base_rate

    def predict(self, fire_nodes: set[str], horizon_minutes: int = 10,
                n_rollouts: int = 300, seed: int = 0) -> dict[str, float]:
        fire_nodes = set(fire_nodes)
        if not fire_nodes:
            return {n: 0.0 for n in self.building.nodes}
        ticks = max(1, int(horizon_minutes * 60 / TICK_SECONDS))
        counts = {n: 0 for n in self.building.nodes}
        for i in range(n_rollouts):
            sim = SpreadSimulator(self.building, self.base_rate, random.Random(seed + i))
            for node in sim.rollout(fire_nodes, ticks):
                counts[node] += 1
        return {n: round(c / n_rollouts, 4) for n, c in counts.items()}


def node_features(building: Building, node_id: str, fire_nodes: set[str],
                  smoke_nodes: set[str]) -> list[float]:
    degree = float(len(building.adjacency[node_id]))
    in_smoke = 1.0 if node_id in smoke_nodes else 0.0
    if not fire_nodes:
        return [99.0, 999.0, 0.0, 0.0, degree, in_smoke]
    # BFS from node toward nearest fire, tracking meters and min openness on path
    queue = deque([(node_id, 0, 0.0, 1.0)])
    seen = {node_id}
    while queue:
        current, hops, meters, min_open = queue.popleft()
        if current in fire_nodes:
            same_floor = 1.0 if building.nodes[current].floor_id == building.nodes[node_id].floor_id else 0.0
            return [float(hops), round(meters, 1), same_floor, round(min_open, 3),
                    degree, in_smoke]
        for edge_id, nbr in building.adjacency[current]:
            if nbr not in seen:
                seen.add(nbr)
                edge = building.edges[edge_id]
                queue.append((nbr, hops + 1, meters + edge.distance_m,
                              min(min_open, EDGE_OPENNESS[edge.edge_type])))
    return [99.0, 999.0, 0.0, 0.0, degree, in_smoke]


class SurrogatePredictor:
    """ML surrogate of the simulated spread dynamics. Trained ONLY on randomized
    synthetic buildings; building-agnostic via identity-free node features."""

    method_name = "surrogate_ml_simulated"

    def __init__(self, model, horizon_minutes: int):
        self.model = model
        self.horizon_minutes = horizon_minutes

    @classmethod
    def load(cls, path=None) -> "SurrogatePredictor | None":
        import joblib
        p = path or SURROGATE_PATH
        try:
            payload = joblib.load(p)
        except FileNotFoundError:
            return None
        return cls(payload["model"], payload["horizon_minutes"])

    def predict(self, building: Building, fire_nodes: set[str],
                smoke_nodes: set[str] | None = None) -> dict[str, float]:
        fire_nodes = set(fire_nodes)
        if not fire_nodes:
            return {n: 0.0 for n in building.nodes}
        smoke_nodes = smoke_nodes or SpreadSimulator(building).smoke_front(fire_nodes)
        node_ids = list(building.nodes)
        X = [node_features(building, n, fire_nodes, smoke_nodes) for n in node_ids]
        probs = self.model.predict_proba(X)[:, 1]
        risk = {n: round(float(p), 4) for n, p in zip(node_ids, probs)}
        for n in fire_nodes:
            risk[n] = 1.0
        return risk
