"""Simulated perception feed. Stand-in for a solved CV system: emits
observations already in building coordinates, all labeled simulated. A real
CV pipeline would later POST the same shape to /observations."""
from __future__ import annotations

from datetime import datetime, timezone


def _obs(obs_id, obs_type, node_id, x, y, z, floor_id, camera_id, confidence):
    return {"observation_id": obs_id, "type": obs_type,
            "world_position": {"x": x, "y": y, "z": z, "floor_id": floor_id,
                               "coordinate_frame": "JACOBS_LOCAL"},
            "graph_node_id": node_id, "camera_id": camera_id,
            "confidence": confidence, "source": "simulated_camera",
            "position_status": "simulated", "provenance": "simulated",
            "timestamp": datetime.now(timezone.utc).isoformat()}


def scenario_observations() -> list[dict]:
    return [
        _obs("OBS_001", "person", "F2_CORRIDOR_EAST", 28.0, 10.0, 4.0, "F2",
             "CAM_F2_EAST", 0.94),
        _obs("OBS_002", "person", "F1_CORRIDOR_CENTER", 20.0, 10.0, 0.0, "F1",
             "CAM_F1_LOBBY", 0.88),
        _obs("OBS_003", "smoke", "F2_CORRIDOR_EAST", 28.0, 10.0, 4.0, "F2",
             "CAM_F2_EAST", 0.81),
        _obs("OBS_004", "fire", "F2_CORRIDOR_EAST", 28.0, 10.0, 4.0, "F2",
             "CAM_F2_EAST", 0.77),
    ]
