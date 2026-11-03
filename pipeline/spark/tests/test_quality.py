"""
Module 26 §8: the sink-side NaN/Infinity gate, unit-tested as pure Python.

Same rule module 23 §2 states for every piece of pipeline logic: if a rule can
be tested without a Spark session, it must be tested without one — so this file
imports `urbanflow.quality` directly and never touches pyspark.
"""
from __future__ import annotations

import math

from urbanflow.quality import non_finite_fields, split_finite


class TestIsFiniteGate:
    def test_nan_rejected(self) -> None:
        clean, rejected = split_finite([{"avg_speed_kmh": float("nan")}])
        assert clean == []
        assert len(rejected) == 1
        assert rejected[0]["_reject_reason"] == "non-finite: avg_speed_kmh"

    def test_positive_infinity_rejected(self) -> None:
        _, rejected = split_finite([{"queue_length_m": math.inf}])
        assert len(rejected) == 1
        assert "queue_length_m" in rejected[0]["_reject_reason"]

    def test_negative_infinity_rejected(self) -> None:
        _, rejected = split_finite([{"avg_speed_kmh": -math.inf}])
        assert len(rejected) == 1

    def test_finite_rows_pass_untouched(self) -> None:
        rows = [
            {"avg_speed_kmh": 0.0, "queue_length_m": 12.5, "vehicle_count": 30},
            {"avg_speed_kmh": None},  # nullable columns are legal (schemas.py)
            {"type": "BLOCKED_LANE", "severity": "high"},  # strings and ints pass
            {"ok": True},  # bools pass (isinstance(value, bool) guard)
        ]
        clean, rejected = split_finite(rows)
        assert rejected == []
        assert clean == rows  # identity of content, no `_reject_reason` added

    def test_nested_dict_rejects_child_field_name(self) -> None:
        row = {"run_id": "r1", "debug": {"drift": float("nan"), "lag_ms": 4}}
        _, rejected = split_finite([row])
        assert len(rejected) == 1
        assert rejected[0]["_reject_reason"] == "non-finite: debug.drift"

    def test_list_value_rejects_per_element(self) -> None:
        _, rejected = split_finite([{"speeds": [1.0, float("nan"), 3.0]}])
        assert len(rejected) == 1
        assert "speeds" in rejected[0]["_reject_reason"]

    def test_multiple_bad_fields_sorted_and_comma_joined(self) -> None:
        _, rejected = split_finite(
            [{"z_metric": float("nan"), "a_metric": math.inf, "fine": 1}]
        )
        assert rejected[0]["_reject_reason"] == "non-finite: a_metric,z_metric"

    def test_input_rows_are_not_mutated(self) -> None:
        row = {"avg_speed_kmh": float("nan")}
        split_finite([row])
        assert "_reject_reason" not in row  # the marked copy is a separate dict


class TestNonFiniteFields:
    def test_clean_row_returns_empty(self) -> None:
        assert non_finite_fields({"a": 1.5, "b": None, "c": "x"}) == []

    def test_returns_every_offending_key(self) -> None:
        bad = non_finite_fields({"a": float("nan"), "b": 2.0, "c": math.inf})
        assert sorted(bad) == ["a", "c"]


class TestSplitContract:
    def test_empty_input(self) -> None:
        assert split_finite([]) == ([], [])

    def test_mixed_batch_splits_exactly(self) -> None:
        rows = [
            {"v": 1.0},
            {"v": float("nan")},
            {"v": 2.0},
            {"v": math.inf},
        ]
        clean, rejected = split_finite(rows)
        assert [row["v"] for row in clean] == [1.0, 2.0]
        assert len(rejected) == 2
        assert all("_reject_reason" in row for row in rejected)
