"""
Unit tests for the MongoDB analytics mirror.

Module 23 §2: logic testable without Spark must be tested without Spark — and
here without the driver or a server too, since `urbanflow.mongo_sink` imports
`pymongo` lazily. These cover the two guarantees the mirror makes: a stable,
collision-free document key (so a batch replay overwrites rather than
duplicates) and `_id` kept out of the `$set` payload.
"""
from __future__ import annotations

from urbanflow.mongo_sink import (
    ANOMALIES_COLLECTION,
    LANE_METRICS_COLLECTION,
    anomaly_document_id,
    anomaly_upsert,
    metric_document_id,
    metric_upsert,
)


def _metric_row() -> dict:
    return {
        "window_start": "2026-10-31T00:00:00Z",
        "window_end": "2026-10-31T00:00:10Z",
        "intersection_id": "INT_042_MARKET_5TH",
        "controller": "adaptive",
        "approach_lane": "NB-TR",
        "vehicle_count": 12,
        "weighted_delay": 40.0,
        "max_queue_m": 55.0,
        "avg_speed_kmh": 18.5,
        "discharge_count": 6,
        "pressure_index": 16.0,
        "run_id": "run-1",
        "schema_version": 1,
    }


def _anomaly_row() -> dict:
    return {
        "schema_version": 1,
        "event_id": "anom-42",
        "type": "DEMAND_SURGE",
        "lane": "NB-TR",
        "severity": "warning",
        "evidence": ["ewma z=3.1"],
        "window_start": "2026-10-31T00:00:00Z",
        "window_end": "2026-10-31T00:00:10Z",
        "detected_at": "2026-10-31T00:00:11Z",
        "run_id": "run-1",
    }


class TestMetricKey:
    def test_is_deterministic(self) -> None:
        row = _metric_row()
        assert metric_document_id(row) == metric_document_id(dict(row))
        assert metric_document_id(row) == "run-1|NB-TR|2026-10-31T00:00:00Z"

    def test_distinguishes_lane_and_window(self) -> None:
        base = metric_document_id(_metric_row())
        other_lane = _metric_row()
        other_lane["approach_lane"] = "SB-TR"
        other_window = _metric_row()
        other_window["window_start"] = "2026-10-31T00:00:10Z"
        assert len({base, metric_document_id(other_lane), metric_document_id(other_window)}) == 3


class TestUpsertShape:
    def test_metric_fields_exclude_id(self) -> None:
        doc_id, fields = metric_upsert(_metric_row())
        assert doc_id == metric_document_id(_metric_row())
        assert "_id" not in fields
        assert fields["vehicle_count"] == 12

    def test_anomaly_id_uses_event_id(self) -> None:
        doc_id, fields = anomaly_upsert(_anomaly_row())
        assert doc_id == "anom-42"
        assert anomaly_document_id(_anomaly_row()) == "anom-42"
        assert "_id" not in fields


class TestModuleContract:
    def test_collection_names_are_stable(self) -> None:
        # The edge gateway and any BI reader assume these names; pin them.
        assert LANE_METRICS_COLLECTION == "lane_metrics"
        assert ANOMALIES_COLLECTION == "anomalies"

    def test_no_top_level_pymongo_import(self) -> None:
        # pymongo is imported lazily inside the write path, so importing the
        # module (and these tests) works without the driver installed.
        import urbanflow.mongo_sink as module

        assert "pymongo" not in dir(module)
