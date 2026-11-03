"""
Module 23 §4 and §7: golden window math, plus the `Settings` contract.

The window row is what the lake and the controller both consume, so its
definitions are pinned here: a distinct vehicle is counted once however many
ticks it appears in, delay is class-weighted, discharge is measured past the stop
line, and pressure is the same formula `packages/core/src/control/pressure.ts`
evaluates.
"""
from __future__ import annotations

from typing import Any, Dict, List

import pytest

from urbanflow.constants import LANE_LENGTH_M, PRESSURE_WEIGHTS, VEHICLE_PRIORITY_WEIGHTS
from urbanflow.io import (
    DEFAULT_KAFKA_BOOTSTRAP,
    DEFAULT_LAKE_PATH,
    DEFAULT_SHUFFLE_PARTITIONS,
    load_settings,
)
from urbanflow.windows import compute_10s_window

WINDOW_START = "2026-10-29T14:03:10Z"
WINDOW_END = "2026-10-29T14:03:20Z"


def tick(
    vehicle_id: str,
    vehicle_type: str = "CAR",
    wait_s: float = 0.0,
    speed_kmh: float = 0.0,
    distance_m: float = 40.0,
    queue_m: float = 0.0,
    lane: str = "NB-TR",
    tick_index: int = 0,
) -> Dict[str, Any]:
    """One telemetry record, shaped like the zod contract's JSON output."""
    return {
        "schemaVersion": 1,
        # Module 02 §3 (Rule 12): `<runId>:<tick>:<lane|na>:<kind>` — a fixture
        # with a free-form id would let a non-deterministic producer pass.
        "eventId": f"run-test:{tick_index}:{lane}:telemetry",
        "timestamp": WINDOW_START,
        "intersectionId": "INT_042_MARKET_5TH",
        "controller": "adaptive",
        "approachLane": lane,
        "vehicle": {
            "vehicleId": vehicle_id,
            "type": vehicle_type,
            "priorityLevel": 0.0,
            "speedKmh": speed_kmh,
            "distanceToStopLineMeters": distance_m,
            "waitingTimeSeconds": wait_s,
        },
        "laneMetrics": {"currentQueueLengthMeters": queue_m, "occupancyPercent": 0.0},
    }


def window(events: List[Dict[str, Any]]) -> Dict[str, Any]:
    return compute_10s_window(events, WINDOW_START, WINDOW_END, "run-test")


class TestWindowAggregation:
    def test_counts_vehicles_not_records(self) -> None:
        # The same two vehicles are observed on three consecutive ticks inside
        # the window. Counting records would report six vehicles.
        events = [
            tick("v1"), tick("v2"),
            tick("v1"), tick("v2"),
            tick("v1", distance_m=30.0),
        ]
        assert window(events)["vehicle_count"] == 2

    def test_weighted_delay_uses_class_priority(self) -> None:
        events = [tick("bus-1", "BUS", wait_s=10.0), tick("car-1", "CAR", wait_s=5.0)]
        expected = VEHICLE_PRIORITY_WEIGHTS["BUS"] * 10.0 + VEHICLE_PRIORITY_WEIGHTS["CAR"] * 5.0
        assert window(events)["weighted_delay"] == pytest.approx(expected)

    def test_unknown_vehicle_type_falls_back_to_unit_weight(self) -> None:
        events = [tick("x-1", "HOVERCRAFT", wait_s=4.0)]
        assert window(events)["weighted_delay"] == pytest.approx(4.0)

    def test_discharge_is_measured_past_the_stop_line(self) -> None:
        events = [
            tick("v1", distance_m=12.0),   # approaching: not discharged
            tick("v2", distance_m=0.0),    # at the line: discharged
            tick("v2", distance_m=-3.0),   # same vehicle, past the line: still once
            tick("v3", distance_m=-1.0),   # discharged
        ]
        assert window(events)["discharge_count"] == 2

    def test_pressure_matches_controller_formula(self) -> None:
        events = [
            tick("bus-1", "BUS", wait_s=10.0, queue_m=30.0),
            tick("car-1", "CAR", wait_s=5.0, queue_m=50.0),
        ]
        row = window(events)
        mean_queue = (30.0 + 50.0) / 2.0
        expected = (
            PRESSURE_WEIGHTS["alpha"] * row["vehicle_count"]
            + PRESSURE_WEIGHTS["beta"] * (row["weighted_delay"] / 10.0)
            + PRESSURE_WEIGHTS["gamma"] * ((10.0 * mean_queue) / LANE_LENGTH_M)
        )
        assert row["pressure_index"] == pytest.approx(expected)
        assert row["max_queue_m"] == pytest.approx(50.0)

    def test_empty_window_reports_no_speed_rather_than_zero(self) -> None:
        # A missing reading is not a stopped lane: `avg_speed_kmh` stays None.
        row = window([])
        assert row["avg_speed_kmh"] is None
        assert row["vehicle_count"] == 0
        assert row["discharge_count"] == 0
        assert row["pressure_index"] == 0.0

    def test_window_bounds_are_echoed_unchanged(self) -> None:
        row = window([tick("v1")])
        assert row["window_start"] == WINDOW_START
        assert row["window_end"] == WINDOW_END
        assert row["schema_version"] == 1


class TestSettings:
    def test_defaults_are_used_when_the_environment_is_empty(self) -> None:
        settings = load_settings({})
        assert settings.kafka_bootstrap_servers == DEFAULT_KAFKA_BOOTSTRAP
        assert settings.lake_storage_path == DEFAULT_LAKE_PATH
        assert settings.shuffle_partitions == DEFAULT_SHUFFLE_PARTITIONS
        assert settings.lane_metrics_checkpoint.endswith("/_checkpoints/lane_metrics")

    def test_shuffle_partitions_outside_the_allowed_band_fall_back(self) -> None:
        # Module 23 §3: 6-8 locally. 200 is the Spark default this guards against.
        assert load_settings({"SPARK_SHUFFLE_PARTITIONS": "200"}).shuffle_partitions == 6
        assert load_settings({"SPARK_SHUFFLE_PARTITIONS": "8"}).shuffle_partitions == 8
        assert load_settings({"SPARK_SHUFFLE_PARTITIONS": "nonsense"}).shuffle_partitions == 6

    def test_trailing_slash_is_normalised(self) -> None:
        settings = load_settings({"LAKE_STORAGE_PATH": "/data/lake/"})
        assert settings.lake_storage_path == "/data/lake"

    def test_settings_are_immutable(self) -> None:
        settings = load_settings({})
        with pytest.raises(Exception):
            settings.lake_storage_path = "/elsewhere"  # type: ignore[misc]
