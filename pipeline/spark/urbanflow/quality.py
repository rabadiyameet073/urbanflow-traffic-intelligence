"""
Module 26 §8: no NaN/Infinity in metrics — the sink-side gate.

Pure Python and deliberately *not* a Spark ``F.isnan`` chain: the window and
detector logic already runs on the driver as plain data, so the gate runs on
the same rows before the DataFrame exists and is unit-testable without a
Spark session (the same separation module 23 §2 asks of every rule). A
rejected row is counted and logged — a silent drop is the failure mode this
gate exists to prevent.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Tuple

Row = Dict[str, Any]


def _is_finite(value: Any) -> bool:
    """None passes (nullable columns are legal); non-floats pass; floats must be finite."""
    if value is None:
        return True
    if isinstance(value, bool):
        return True
    if isinstance(value, float):
        return math.isfinite(value)
    if isinstance(value, (int, str)):
        return True
    if isinstance(value, (list, tuple)):
        return all(_is_finite(item) for item in value)
    return True


def non_finite_fields(row: Row) -> List[str]:
    """Names of fields carrying NaN/Infinity (recursing into nested dicts)."""
    bad: List[str] = []
    for key, value in row.items():
        if isinstance(value, dict):
            nested = [f"{key}.{name}" for name, inner in value.items() if not _is_finite(inner)]
            bad.extend(nested)
        elif not _is_finite(value):
            bad.append(key)
    return bad


def split_finite(rows: List[Row]) -> Tuple[List[Row], List[Row]]:
    """Return (clean, rejected); rejected rows carry a `_reject_reason`."""
    clean: List[Row] = []
    rejected: List[Row] = []
    for row in rows:
        bad = non_finite_fields(row)
        if bad:
            marked = dict(row)
            marked["_reject_reason"] = "non-finite: " + ",".join(sorted(bad))
            rejected.append(marked)
        else:
            clean.append(row)
    return clean, rejected
