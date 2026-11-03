"""
Module 23 §1/§7: golden-file tests over the pure window and anomaly logic.

`tests/golden/*.json` hold hand-built inputs with hand-derived expected values.
They pin the *definitions* (what `weighted_delay` counts, when BLOCKAGE may
fire, how an eventId is shaped) so a refactor that changes semantics fails here
instead of silently rewriting the lake.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List

import pytest

from urbanflow.anomalies import detect_anomalies
from urbanflow.windows import compute_10s_window

GOLDEN = Path(__file__).resolve().parent / "golden"


def _load(name: str) -> Dict[str, Any]:
    path = GOLDEN / name
    assert path.is_file(), f"missing golden fixture: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


def test_golden_window_aggregation() -> None:
    case = _load("golden_windows.json")
    row = compute_10s_window(
        case["events"], case["window_start"], case["window_end"], case["run_id"]
    )
    expected: Dict[str, Any] = case["expected"]
    for key, want in expected.items():
        assert key in row, f"golden expects column {key!r} in the window row"
        got = row[key]
        if isinstance(want, float):
            assert got == pytest.approx(want), f"{key}: got {got!r}, golden {want!r}"
        else:
            assert got == want, f"{key}: got {got!r}, golden {want!r}"


def _cases() -> List[Dict[str, Any]]:
    return _load("golden_anomalies.json")["cases"]


@pytest.mark.parametrize("case", _cases(), ids=lambda c: c["name"])
def test_golden_anomalies(case: Dict[str, Any]) -> None:
    anomalies, _ = detect_anomalies(
        case["window"],
        signal_indication=case["signal_indication"],
        signal_duration_s=case.get("signal_duration_s", 0.0),
        ems_wait_s=case.get("ems_wait_s", 0.0),
        window_index=case["window_index"],
    )
    assert [a["type"] for a in anomalies] == case["expected"]["types"]
    assert [a["severity"] for a in anomalies] == case["expected"]["severities"]
    assert [a["event_id"] for a in anomalies] == case["expected"]["event_ids"]
