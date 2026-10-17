"""Trains the fire-spread surrogate on randomized synthetic buildings.
Jacobs Hall is NEVER in the training set; it is the held-out validation building.
Ground-truth dynamics are our simulator's (simulated, plausible-physics)."""
from __future__ import annotations

import random

from .building import Building
from .spread import (FEATURE_NAMES, SURROGATE_PATH, SpreadSimulator,
                     TICK_SECONDS, node_features)


def random_building(rng: random.Random) -> Building:
    n_floors = rng.randint(2, 4)
    width = rng.uniform(25, 50)
    depth = rng.uniform(12, 25)
    floors, nodes, edges = [], [], []

    def add_node(node_id, floor_id, node_type, x, y, z):
        nodes.append({"node_id": node_id, "floor_id": floor_id, "node_type": node_type,
                      "label": node_id, "x": round(x, 1), "y": round(y, 1), "z": round(z, 1)})

    def add_edge(a, b, edge_type):
        na = next(n for n in nodes if n["node_id"] == a)
        nb = next(n for n in nodes if n["node_id"] == b)
        d = ((na["x"] - nb["x"]) ** 2 + (na["y"] - nb["y"]) ** 2
             + (na["z"] - nb["z"]) ** 2) ** 0.5
        edges.append({"edge_id": f"E{len(edges):03d}", "from_node": a, "to_node": b,
                      "distance_m": round(max(d, 1.0), 1), "edge_type": edge_type})

    for i in range(n_floors):
        fid, z = f"L{i}", i * 4.0
        floors.append({"floor_id": fid, "name": fid, "elevation_m": z})
        mid = depth / 2
        add_node(f"{fid}_S0", fid, "stairs", width * 0.1, mid, z)
        add_node(f"{fid}_S1", fid, "stairs", width * 0.9, mid, z)
        corridor_ids = []
        for j in range(3):
            cid = f"{fid}_C{j}"
            corridor_ids.append(cid)
            add_node(cid, fid, "corridor", width * (0.25 + 0.25 * j), mid, z)
        for a, b in zip(corridor_ids, corridor_ids[1:]):
            add_edge(a, b, "corridor")
        add_edge(f"{fid}_S0", corridor_ids[0], "doorway")
        add_edge(f"{fid}_S1", corridor_ids[-1], "doorway")
        for r in range(rng.randint(2, 4)):
            rid = f"{fid}_R{r}"
            add_node(rid, fid, "room", rng.uniform(2, width - 2),
                     mid + rng.choice([-1, 1]) * depth * 0.3, z)
            add_edge(rid, rng.choice(corridor_ids), "doorway")
    for i in range(n_floors - 1):
        add_edge(f"L{i}_S0", f"L{i+1}_S0", "stairs")
        add_edge(f"L{i}_S1", f"L{i+1}_S1", "stairs")

    return Building({"building_id": f"synthetic_{rng.randint(0, 10**9)}",
                     "coordinate_frame": "SYNTHETIC_LOCAL", "provenance": "simulated",
                     "source_note": "randomized synthetic training building",
                     "floors": floors, "nodes": nodes, "edges": edges})


def generate_dataset(buildings, rng: random.Random, rollouts_per_building: int = 3,
                     horizon_minutes: int = 10):
    ticks = int(horizon_minutes * 60 / TICK_SECONDS)
    X, y = [], []
    for b in buildings:
        node_ids = list(b.nodes)
        for _ in range(rollouts_per_building):
            ignition = {rng.choice(node_ids)}
            sim = SpreadSimulator(b, rng=random.Random(rng.randint(0, 10**9)))
            smoke = sim.smoke_front(ignition)
            burned = sim.rollout(ignition, ticks)
            for n in node_ids:
                X.append(node_features(b, n, ignition, smoke))
                y.append(1 if n in burned else 0)
    return X, y


def main(n_buildings: int = 200, seed: int = 0):
    import joblib
    from sklearn.ensemble import GradientBoostingClassifier
    from sklearn.metrics import roc_auc_score

    rng = random.Random(seed)
    buildings = [random_building(rng) for _ in range(n_buildings)]
    split = int(n_buildings * 0.85)
    X_train, y_train = generate_dataset(buildings[:split], rng)
    X_val, y_val = generate_dataset(buildings[split:], rng)

    clf = GradientBoostingClassifier(random_state=seed)
    clf.fit(X_train, y_train)
    val_auc = roc_auc_score(y_val, clf.predict_proba(X_val)[:, 1])

    jacobs = Building.load()
    X_j, y_j = generate_dataset([jacobs], random.Random(seed + 1),
                                rollouts_per_building=30)
    jacobs_auc = roc_auc_score(y_j, clf.predict_proba(X_j)[:, 1])

    SURROGATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": clf, "feature_names": FEATURE_NAMES, "horizon_minutes": 10,
                 "trained_on": "randomized synthetic buildings (simulated dynamics)",
                 "jacobs_in_training": False}, SURROGATE_PATH)
    print(f"samples: train={len(X_train)} val={len(X_val)}")
    print(f"held-out random-building AUC: {val_auc:.3f}")
    print(f"held-out JACOBS HALL AUC (never in training): {jacobs_auc:.3f}")
    print(f"saved {SURROGATE_PATH}")


if __name__ == "__main__":
    main()
