import random

import pytest
from sentinel_engine.building import Building
from sentinel_engine.spread import (MonteCarloPredictor, SpreadSimulator,
                                    node_features)


@pytest.fixture(scope="module")
def building():
    return Building.load()


def test_rollout_only_spreads_along_edges(building):
    sim = SpreadSimulator(building, rng=random.Random(0))
    burned = sim.rollout({"F2_CORRIDOR_EAST"}, ticks=3)
    # after 3 ticks fire can be at most 3 hops away
    for node in burned:
        feats = node_features(building, node, {"F2_CORRIDOR_EAST"}, set())
        assert feats[0] <= 3


def test_ignition_sources_always_burned(building):
    sim = SpreadSimulator(building, rng=random.Random(1))
    assert "F2_CORRIDOR_EAST" in sim.rollout({"F2_CORRIDOR_EAST"}, ticks=1)


def test_mc_risk_decreases_with_distance(building):
    mc = MonteCarloPredictor(building)
    risk = mc.predict({"F2_CORRIDOR_EAST"}, horizon_minutes=5, n_rollouts=200, seed=0)
    assert risk["F2_CORRIDOR_EAST"] == 1.0
    assert risk["F2_CORRIDOR_CENTER"] > risk["B_STUDIO_10"]


def test_mc_deterministic_for_seed(building):
    mc = MonteCarloPredictor(building)
    a = mc.predict({"F2_CORRIDOR_EAST"}, n_rollouts=50, seed=7)
    b = mc.predict({"F2_CORRIDOR_EAST"}, n_rollouts=50, seed=7)
    assert a == b


def test_smoke_front_is_one_hop(building):
    sim = SpreadSimulator(building)
    smoke = sim.smoke_front({"F2_CORRIDOR_EAST"})
    assert "F2_STUDIO_220" in smoke and "F2_CORRIDOR_CENTER" in smoke
    assert "F2_CORRIDOR_WEST" not in smoke


def test_node_features_shape_and_unreachable(building):
    feats = node_features(building, "F2_CORRIDOR_CENTER", {"F2_CORRIDOR_EAST"}, set())
    assert len(feats) == 6
    assert feats[0] == 1  # one hop
    assert feats[2] == 1.0  # same floor
    none_reachable = node_features(building, "F2_CORRIDOR_CENTER", set(), set())
    assert none_reachable[0] == 99
