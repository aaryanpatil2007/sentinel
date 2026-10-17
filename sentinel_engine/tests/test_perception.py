from sentinel_engine.building import Building
from sentinel_engine.perception import scenario_observations


def test_scenario_observations_shape_and_labeling():
    obs = scenario_observations()
    assert len(obs) == 4
    building = Building.load()
    for o in obs:
        assert o["position_status"] == "simulated"
        assert o["provenance"] == "simulated"
        assert o["source"] == "simulated_camera"
        assert o["world_position"]["coordinate_frame"] == "JACOBS_LOCAL"
        assert o["graph_node_id"] in building.nodes
        node = building.nodes[o["graph_node_id"]]
        assert o["world_position"]["floor_id"] == node.floor_id


def test_scenario_includes_fire_and_smoke_on_f2_east():
    obs = scenario_observations()
    types = {o["type"] for o in obs if o["graph_node_id"] == "F2_CORRIDOR_EAST"}
    assert {"person", "smoke", "fire"} <= types
