"""
Module 23 §2: parity test for constants mirrored from `contracts.ts` (Rule 12).

The Python pipeline must not carry its own idea of a lane list, a priority
weight or the pressure formula. Both sides are parsed from source — no Spark, no
Node — so this test runs anywhere pytest runs, and it fails on drift in either
direction instead of at row 40 000 in a cluster.

`contracts.ts` is parsed textually rather than imported: a TypeScript parser in
Python would be a large dependency for six constants.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List

from urbanflow.constants import (
    KAFKA_TOPICS,
    LANES,
    LANE_LENGTH_M,
    PRESSURE_WEIGHTS,
    TIMING,
    VEHICLE_PRIORITY_WEIGHTS,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
CONTRACTS_TS = PROJECT_ROOT / "packages" / "core" / "src" / "contracts.ts"
PRESSURE_TS = PROJECT_ROOT / "packages" / "core" / "src" / "control" / "pressure.ts"


def _read(path: Path) -> str:
    assert path.is_file(), f"missing source of truth: {path}"
    return path.read_text(encoding="utf-8")


def _block(text: str, opener: str, terminator: str = "\n}") -> str:
    """Return the text between `opener` and the first `terminator` at column 0."""
    start = text.index(opener) + len(opener)
    end = text.index(terminator, start)
    return text[start:end]


def _ts_lanes() -> List[str]:
    block = _block(_read(CONTRACTS_TS), "export const LANES = [", "\n] as const")
    return re.findall(r"'([A-Z]{2}-[A-Z]{1,2})'", block)


def _ts_timing() -> Dict[str, float]:
    block = _block(_read(CONTRACTS_TS), "export const TIMING = {")
    values: Dict[str, float] = {}
    for name, raw in re.findall(r"^\s*([A-Z_0-9]+):\s*(-?[0-9.]+)", block, re.MULTILINE):
        values[name] = float(raw)
    return values


def _ts_priority_weights() -> Dict[str, float]:
    block = _block(_read(CONTRACTS_TS), "export const VEHICLE_SPECS: Record<VehicleType, VehicleSpec> = {")
    weights: Dict[str, float] = {}
    # Each vehicle type is a `NAME: { ... }` entry; the weight is inside it.
    for name, body in re.findall(r"^  ([A-Z_]+): \{(.*?)^  \},", block, re.MULTILINE | re.DOTALL):
        match = re.search(r"priorityWeight:\s*([0-9.]+)", body)
        assert match, f"VEHICLE_SPECS.{name} has no priorityWeight"
        weights[name] = float(match.group(1))
    return weights


def _ts_pressure_weights() -> Dict[str, float]:
    text = _read(PRESSURE_TS)
    match = re.search(
        r"DEFAULT_PRESSURE_WEIGHTS[^=]*=\s*\{([^}]*)\}", text, re.DOTALL
    )
    assert match, "DEFAULT_PRESSURE_WEIGHTS not found in pressure.ts"
    return {
        key: float(value)
        for key, value in re.findall(r"(alpha|beta|gamma):\s*([0-9.]+)", match.group(1))
    }


def _ts_lane_length() -> float:
    block = _block(_read(CONTRACTS_TS), "export const DEFAULT_SIM_CONFIG: SimConfig = {")
    match = re.search(r"laneLengthM:\s*([0-9.]+)", block)
    assert match, "DEFAULT_SIM_CONFIG.laneLengthM not found"
    return float(match.group(1))


def _ts_kafka_topics() -> Dict[str, Dict[str, Any]]:
    """Parse the frozen `KAFKA_TOPICS` block (module 02 §3, Rule 12)."""
    block = _block(_read(CONTRACTS_TS), "export const KAFKA_TOPICS = {")
    topics: Dict[str, Dict[str, Any]] = {}
    for name, topic, key, partitions, retention in re.findall(
        r"(\w+): \{ name: '([^']+)', key: '([^']+)', partitions: (\d+), retentionMs: ([\d_]+) \}",
        block,
    ):
        topics[name] = {
            "name": topic,
            "key": key,
            "partitions": int(partitions),
            "retention_ms": int(retention.replace("_", "")),
        }
    assert topics, "KAFKA_TOPICS block parsed empty — did the shape change?"
    return topics


# `WINDOW_DURATION_S` is a pipeline concern (module 02 §3 fixes the 10 s window),
# not a contracts.ts constant, so it is listed here rather than compared.
PIPELINE_LOCAL_TIMING = {"WINDOW_DURATION_S"}


def _closed(actual: float, expected: float) -> bool:
    return abs(actual - expected) < 1e-9


class TestContractsParity:
    def test_lane_ids_match(self) -> None:
        assert list(LANES) == _ts_lanes()

    def test_timing_matches(self) -> None:
        reference = _ts_timing()
        extra = set(TIMING) - set(reference)
        assert extra == PIPELINE_LOCAL_TIMING, (
            f"TIMING carries keys that contracts.ts does not declare: {sorted(extra - PIPELINE_LOCAL_TIMING)}"
        )
        for name, value in TIMING.items():
            if name in PIPELINE_LOCAL_TIMING:
                continue
            assert _closed(float(value), reference[name]), (
                f"TIMING.{name}: python {value} != contracts {reference[name]}"
            )

    def test_vehicle_priority_weights_match(self) -> None:
        reference = _ts_priority_weights()
        assert set(VEHICLE_PRIORITY_WEIGHTS) == set(reference)
        for vehicle_type, weight in VEHICLE_PRIORITY_WEIGHTS.items():
            assert _closed(float(weight), reference[vehicle_type]), (
                f"priorityWeight[{vehicle_type}]: python {weight} != contracts {reference[vehicle_type]}"
            )

    def test_pressure_weights_match(self) -> None:
        reference = _ts_pressure_weights()
        assert reference, "pressure.ts carries no weights"
        assert set(PRESSURE_WEIGHTS) == set(reference)
        for key, weight in PRESSURE_WEIGHTS.items():
            assert _closed(float(weight), reference[key]), (
                f"pressure weight {key}: python {weight} != contracts {reference[key]}"
            )

    def test_lane_length_matches_sim_config_default(self) -> None:
        assert _closed(LANE_LENGTH_M, _ts_lane_length())

    def test_kafka_topics_match(self) -> None:
        reference = _ts_kafka_topics()
        assert set(KAFKA_TOPICS) == set(reference), "topic set drifted from contracts.ts"
        for name, topic in KAFKA_TOPICS.items():
            assert topic == reference[name], (
                f"KAFKA_TOPICS.{name}: python {topic} != contracts {reference[name]}"
            )
