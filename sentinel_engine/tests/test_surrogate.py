import random

import pytest
from sentinel_engine.building import Building
from sentinel_engine.spread import MonteCarloPredictor, SurrogatePredictor
from sentinel_engine.train_spread_model import generate_dataset, random_building


def test_random_building_valid_graph():
    b = random_building(random.Random(42))
    assert len(b.floors) >= 2
    for e in b.edges.values():
        assert e.from_node in b.nodes and e.to_node in b.nodes
        fa, fb = b.nodes[e.from_node].floor_id, b.nodes[e.to_node].floor_id
        if fa != fb:
            assert e.edge_type in ("stairs", "elevator")


def test_generate_dataset_shapes():
    rng = random.Random(0)
    buildings = [random_building(rng) for _ in range(3)]
    X, y = generate_dataset(buildings, rng, rollouts_per_building=2)
    assert len(X) == len(y) > 0
    assert all(len(row) == 6 for row in X)
    assert set(y) <= {0, 1}


def test_surrogate_checkpoint_exists_and_predicts():
    sp = SurrogatePredictor.load()
    assert sp is not None, "run train_spread_model first; checkpoint must be committed"
    building = Building.load()
    risk = sp.predict(building, {"F2_CORRIDOR_EAST"})
    assert set(risk) == set(building.nodes)
    assert all(0.0 <= v <= 1.0 for v in risk.values())
    assert risk["F2_CORRIDOR_CENTER"] > risk["B_MAKERSPACE"]


def test_surrogate_agrees_with_monte_carlo_on_heldout_jacobs():
    """Headline validation: AUC vs simulated ground truth on a building the
    model never saw in training."""
    from sklearn.metrics import roc_auc_score
    from sentinel_engine.spread import SpreadSimulator

    building = Building.load()
    sp = SurrogatePredictor.load()
    preds = sp.predict(building, {"F2_CORRIDOR_EAST"})
    labels, scores = [], []
    for i in range(40):
        sim = SpreadSimulator(building, rng=random.Random(1000 + i))
        burned = sim.rollout({"F2_CORRIDOR_EAST"}, ticks=20)
        for node in building.nodes:
            labels.append(1 if node in burned else 0)
            scores.append(preds[node])
    assert roc_auc_score(labels, scores) >= 0.75


def test_missing_checkpoint_returns_none(tmp_path):
    assert SurrogatePredictor.load(tmp_path / "nope.joblib") is None
