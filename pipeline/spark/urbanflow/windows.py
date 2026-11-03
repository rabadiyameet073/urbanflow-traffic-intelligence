"""
Module 23 & Module 26: pure 10-second window aggregation.

Pure by construction: no IO, no clock, no globals mutated. Given the same event
list it returns the same row, which is what makes the golden-file tests in
`tests/golden/` meaningful and the Parquet sink idempotent per `run_id`.
"""
from typing import Any, Dict, List, Optional

from .constants import LANE_LENGTH_M, PRESSURE_WEIGHTS, VEHICLE_PRIORITY_WEIGHTS

# Empty-window defaults. `avg_speed_kmh` stays None because a window with no
# vehicles has no measured speed — a 0.0 there would read as "stopped forever".
def _empty_window(window_start: str, window_end: str, run_id: str) -> Dict[str, Any]:
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


def _vehicle(event: Dict[str, Any]) -> Dict[str, Any]:
    vehicle = event.get("vehicle")
    return vehicle if isinstance(vehicle, dict) else {}


def _priority_weight(event: Dict[str, Any]) -> float:
    """
    Class priority weight, mirroring `VEHICLE_SPECS[type].priorityWeight`.

    The telemetry's own `priorityLevel` field is not the pressure weight: a bus
    and a car both report level 0, but the controller counts a bus 8.5 times.
    """
    vehicle_type = _vehicle(event).get("type")
    return VEHICLE_PRIORITY_WEIGHTS.get(str(vehicle_type), 1.0)


def compute_10s_window(
    events: List[Dict[str, Any]],
    window_start: str,
    window_end: str,
    run_id: str,
) -> Dict[str, Any]:
    """
    Aggregate one lane's telemetry into a `lane_metrics` row (Module 26 §2).

    Definitions, so nobody has to guess what the column means:
      vehicle_count   distinct vehicle ids observed in the window, not record count
      weighted_delay  sum(priorityWeight * waitingTimeSeconds) — same quantity the
                      controller's pressure formula consumes
      max_queue_m     max reported queue length in the window
      pressure_index  alpha*N + beta*(weighted_delay/10) + gamma*(10*mean_queue/laneLength),
                      the controller's formula evaluated on the window means
      discharge_count distinct vehicle ids observed at or past the stop line
    """
    if not events:
        return _empty_window(window_start, window_end, run_id)

    first = events[0]
    lane = first.get("approachLane", "NB-TR")
    controller = first.get("controller", "adaptive")
    intersection_id = first.get("intersectionId", "INT_042_MARKET_5TH")

    vehicle_ids: set[str] = set()
    discharged_ids: set[str] = set()
    weighted_delay = 0.0
    speeds: List[float] = []
    queues: List[float] = []

    for event in events:
        vehicle = _vehicle(event)
        if not vehicle:
            continue

        vehicle_id = vehicle.get("vehicleId")
        if isinstance(vehicle_id, str):
            vehicle_ids.add(vehicle_id)

        wait = vehicle.get("waitingTimeSeconds")
        if isinstance(wait, (int, float)):
            weighted_delay += _priority_weight(event) * float(wait)

        speed = vehicle.get("speedKmh")
        if isinstance(speed, (int, float)):
            speeds.append(float(speed))

        distance = vehicle.get("distanceToStopLineMeters")
        if isinstance(distance, (int, float)) and distance <= 0 and isinstance(vehicle_id, str):
            discharged_ids.add(vehicle_id)

        lane_metrics = event.get("laneMetrics")
        if isinstance(lane_metrics, dict):
            queue = lane_metrics.get("currentQueueLengthMeters")
            if isinstance(queue, (int, float)):
                queues.append(float(queue))

    vehicle_count = len(vehicle_ids)
    max_queue = max(queues) if queues else 0.0
    mean_queue = (sum(queues) / len(queues)) if queues else 0.0
    avg_speed: Optional[float] = (sum(speeds) / len(speeds)) if speeds else None

    pressure = (
        PRESSURE_WEIGHTS["alpha"] * vehicle_count
        + PRESSURE_WEIGHTS["beta"] * (weighted_delay / 10.0)
        + PRESSURE_WEIGHTS["gamma"] * ((10.0 * mean_queue) / LANE_LENGTH_M)
    )

    return {
        "window_start": window_start,
        "window_end": window_end,
        "intersection_id": intersection_id,
        "controller": controller,
        "approach_lane": lane,
        "vehicle_count": vehicle_count,
        "weighted_delay": float(weighted_delay),
        "max_queue_m": float(max_queue),
        "avg_speed_kmh": float(avg_speed) if avg_speed is not None else None,
        "discharge_count": len(discharged_ids),
        "pressure_index": float(max(pressure, 0.0)),
        "run_id": run_id,
        "schema_version": 1,
    }
