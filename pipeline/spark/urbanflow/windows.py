"""
Module 23: Pure Window Aggregations
"""
from typing import List, Dict, Any

def compute_10s_window(events: List[Dict[str, Any]], window_start: str, window_end: str, run_id: str) -> Dict[str, Any]:
    """
    Computes 10s aggregate metrics for a single lane from raw vehicle events.
    """
    if not events:
        return {
            "window_start": window_start,
            "window_end": window_end,
            "intersection_id": "INT_042_MARKET_5TH",
            "controller": "adaptive",
            "approach_lane": "NB-TR",
            "vehicle_count": 0,
            "weighted_delay": 0.0,
            "max_queue_m": 0.0,
            "avg_speed_kmh": None,
            "discharge_count": 0,
            "pressure_index": 0.0,
            "run_id": run_id,
            "schema_version": 1,
        }

    lane = events[0].get("approachLane", "NB-TR")
    controller = events[0].get("controller", "adaptive")
    intersection_id = events[0].get("intersectionId", "INT_042_MARKET_5TH")

    speeds = [e["vehicle"]["speedKmh"] for e in events if "vehicle" in e and "speedKmh" in e["vehicle"]]
    queues = [e["laneMetrics"]["currentQueueLengthMeters"] for e in events if "laneMetrics" in e]
    waits = [e["vehicle"]["waitingTimeSeconds"] for e in events if "vehicle" in e]

    avg_speed = sum(speeds) / len(speeds) if speeds else None
    max_queue = max(queues) if queues else 0.0
    weighted_delay = sum(waits) if waits else 0.0

    return {
        "window_start": window_start,
        "window_end": window_end,
        "intersection_id": intersection_id,
        "controller": controller,
        "approach_lane": lane,
        "vehicle_count": len(events),
        "weighted_delay": float(weighted_delay),
        "max_queue_m": float(max_queue),
        "avg_speed_kmh": float(avg_speed) if avg_speed is not None else None,
        "discharge_count": 0,
        "pressure_index": float(len(events) + weighted_delay / 10.0 + max_queue / 30.0),
        "run_id": run_id,
        "schema_version": 1,
    }
