"""
Module 23: Pure Anomaly Detection Logic & EWMA Updating
Free of PySpark dependencies for 100% testability.
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional

@dataclass(frozen=True)
class Ewma:
    mean: float
    var: float
    n: int

def ewma_update(s: Ewma, x: float, alpha: float = 0.1) -> Ewma:
    """West's incremental online exponentially weighted mean & variance."""
    if s.n == 0:
        return Ewma(mean=x, var=0.0, n=1)
    d = x - s.mean
    mean = s.mean + alpha * d
    var = (1.0 - alpha) * (s.var + alpha * d * d)
    return Ewma(mean=mean, var=var, n=s.n + 1)

def zscore(s: Ewma, x: float, eps: float = 1e-6) -> float:
    """Compute z-score relative to running EWMA variance."""
    return (x - s.mean) / max(s.var ** 0.5, eps)

def detect_anomalies(
    window_metrics: Dict[str, Any],
    ewma_state: Optional[Ewma] = None,
    signal_indication: str = "G",
    signal_duration_s: float = 0.0,
    ems_wait_s: float = 0.0,
) -> tuple[List[Dict[str, Any]], Ewma]:
    """
    Detects anomalies on 10s window aggregation.
    Returns: (list_of_anomalies, updated_ewma)
    """
    anomalies: List[Dict[str, Any]] = []
    lane = window_metrics.get("approach_lane", "NB-TR")
    vehicle_count = window_metrics.get("vehicle_count", 0)
    discharge_count = window_metrics.get("discharge_count", 0)
    max_queue_m = window_metrics.get("max_queue_m", 0.0)
    run_id = window_metrics.get("run_id", "run-001")
    window_start = window_metrics.get("window_start", "")
    window_end = window_metrics.get("window_end", "")

    # Update arrivals EWMA
    current_arrivals = float(vehicle_count)
    if ewma_state is None:
        ewma_state = Ewma(mean=current_arrivals, var=0.0, n=1)
    else:
        ewma_state = ewma_update(ewma_state, current_arrivals)

    # Rule 1: BLOCKAGE (vehicles present, green indication, but 0 discharge or severe queue)
    if signal_indication == "G" and (
        (vehicle_count >= 3 and discharge_count == 0) or (max_queue_m >= 100.0 and discharge_count == 0)
    ):
        anomalies.append({
            "schemaVersion": 1,
            "eventId": f"{run_id}:{lane}:anom:blockage",
            "type": "BLOCKAGE",
            "lane": lane,
            "severity": "critical" if max_queue_m >= 100.0 else "warning",
            "evidence": [
                f"Discharge is 0 with {vehicle_count} vehicles queued under green indication",
                f"Queue length reached {max_queue_m:.1f}m",
            ],
            "windowStart": window_start,
            "windowEnd": window_end,
            "detectedAt": window_end,
            "runId": run_id,
        })

    # Rule 2: DEMAND_SURGE (z-score > 2.5 after warm-up of at least 12 windows)
    if ewma_state.n >= 12:
        z = zscore(ewma_state, current_arrivals)
        if z > 2.5:
            anomalies.append({
                "schemaVersion": 1,
                "eventId": f"{run_id}:{lane}:anom:surge",
                "type": "DEMAND_SURGE",
                "lane": lane,
                "severity": "warning",
                "evidence": [
                    f"Arrivals count {vehicle_count} exceeds baseline with z-score {z:.2f}",
                    f"Baseline EWMA mean={ewma_state.mean:.1f}",
                ],
                "windowStart": window_start,
                "windowEnd": window_end,
                "detectedAt": window_end,
                "runId": run_id,
            })

    # Rule 3: SIGNAL_STUCK (green duration > 65s without active preemption)
    if signal_indication == "G" and signal_duration_s > 65.0:
        anomalies.append({
            "schemaVersion": 1,
            "eventId": f"{run_id}:{lane}:anom:signal_stuck",
            "type": "SIGNAL_STUCK",
            "lane": lane,
            "severity": "critical",
            "evidence": [f"Signal green duration {signal_duration_s:.1f}s exceeds maximum safety limit 65.0s"],
            "windowStart": window_start,
            "windowEnd": window_end,
            "detectedAt": window_end,
            "runId": run_id,
        })

    # Rule 4: EMS_DELAYED (ambulance in queue > 15s)
    if ems_wait_s > 15.0:
        anomalies.append({
            "schemaVersion": 1,
            "eventId": f"{run_id}:{lane}:anom:ems_delayed",
            "type": "EMS_DELAYED",
            "lane": lane,
            "severity": "critical",
            "evidence": [f"Emergency vehicle held in queue for {ems_wait_s:.1f}s"],
            "windowStart": window_start,
            "windowEnd": window_end,
            "detectedAt": window_end,
            "runId": run_id,
        })

    return anomalies, ewma_state
