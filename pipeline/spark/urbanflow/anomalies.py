"""
Module 23 §4: pure anomaly detection and EWMA updating.

Free of PySpark so every rule is unit-testable, and free of IO so the rules can
be replayed against recorded windows. The output keys are snake_case to match
`ANOMALIES_SCHEMA` and the `anomalies` Parquet table (Module 26 §2); a camelCase
row would fail the sink schema at write time instead of at review time.
"""
from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from .constants import EWMA_ALPHA, EWMA_WARMUP_N, EWMA_Z_THRESHOLD

@dataclass(frozen=True)
class Ewma:
    mean: float
    var: float
    n: int

def ewma_update(s: Ewma, x: float, alpha: float = EWMA_ALPHA) -> Ewma:
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


def make_event_id(run_id: str, tick: int, lane: str, kind: str) -> str:
    """
    Module 02 §3 (Rule 12): the frozen eventId format is
    `<runId>:<tick>:<lane|na>:<kind>`. Mirrors `makeEventId` in contracts.ts; a
    free-form id (or one carrying wall-clock) would break replay determinism
    and duplicate detection.
    """
    return f"{run_id}:{tick}:{lane}:{kind}"


def detect_anomalies(
    window_metrics: Dict[str, Any],
    ewma_state: Optional[Ewma] = None,
    signal_indication: str = "G",
    signal_duration_s: float = 0.0,
    ems_wait_s: float = 0.0,
    window_index: int = 0,
) -> tuple[List[Dict[str, Any]], Ewma]:
    """
    Detects anomalies on 10s window aggregation.
    `window_index` is the monotonic 10 s window counter used as the eventId
    `tick`, so a replayed window produces a byte-identical id.
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
            "schema_version": 1,
            "event_id": make_event_id(run_id, window_index, lane, "anomaly-blockage"),
            "type": "BLOCKAGE",
            "lane": lane,
            "severity": "critical" if max_queue_m >= 100.0 else "warning",
            "evidence": [
                f"Discharge is 0 with {vehicle_count} vehicles queued under green indication",
                f"Queue length reached {max_queue_m:.1f}m",
            ],
            "window_start": window_start,
            "window_end": window_end,
            "detected_at": window_end,
            "run_id": run_id,
        })

    # Rule 2: DEMAND_SURGE (z-score above the threshold, after the warm-up)
    if ewma_state.n >= EWMA_WARMUP_N:
        z = zscore(ewma_state, current_arrivals)
        if z > EWMA_Z_THRESHOLD:
            anomalies.append({
                "schema_version": 1,
                "event_id": make_event_id(run_id, window_index, lane, "anomaly-surge"),
                "type": "DEMAND_SURGE",
                "lane": lane,
                "severity": "warning",
                "evidence": [
                    f"Arrivals count {vehicle_count} exceeds baseline with z-score {z:.2f}",
                    f"Baseline EWMA mean={ewma_state.mean:.1f}",
                ],
                "window_start": window_start,
                "window_end": window_end,
                "detected_at": window_end,
                "run_id": run_id,
            })

    # Rule 3: SIGNAL_STUCK (green duration > 65s without active preemption)
    if signal_indication == "G" and signal_duration_s > 65.0:
        anomalies.append({
            "schema_version": 1,
            "event_id": make_event_id(run_id, window_index, lane, "anomaly-signal-stuck"),
            "type": "SIGNAL_STUCK",
            "lane": lane,
            "severity": "critical",
            "evidence": [f"Signal green duration {signal_duration_s:.1f}s exceeds maximum safety limit 65.0s"],
            "window_start": window_start,
            "window_end": window_end,
            "detected_at": window_end,
            "run_id": run_id,
        })

    # Rule 4: EMS_DELAYED (ambulance in queue > 15s)
    if ems_wait_s > 15.0:
        anomalies.append({
            "schema_version": 1,
            "event_id": make_event_id(run_id, window_index, lane, "anomaly-ems-delayed"),
            "type": "EMS_DELAYED",
            "lane": lane,
            "severity": "critical",
            "evidence": [f"Emergency vehicle held in queue for {ems_wait_s:.1f}s"],
            "window_start": window_start,
            "window_end": window_end,
            "detected_at": window_end,
            "run_id": run_id,
        })

    return anomalies, ewma_state

