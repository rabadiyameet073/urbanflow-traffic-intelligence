"""
Module 23 (analytics mirror): optional MongoDB sink for the Spark stream.

Parquet remains the source of truth (ADR-0008). This *mirrors* the same 10-second
`lane_metrics` and `anomaly` rows into MongoDB so the edge/UI can query recent
analytics without opening the lake. It is purely additive — the streaming job's
Parquet and Kafka writes are untouched, and the default (no `MONGO_URI`) leaves
the pipeline exactly as it was.

Two guarantees keep it honest:

  * **Idempotent.** Every document is keyed by a deterministic `_id`, so an
    at-least-once replay of a micro-batch overwrites its own rows instead of
    appending a duplicate — the same contract the per-`batch=<id>` Parquet
    overwrite gives in `urbanflow_stream.process_batch`.
  * **Best-effort.** A MongoDB outage must not stall the streaming query or
    poison the checkpoint, so failures are raised here for the caller to catch
    and log; the rows are already durable on the lake regardless.

`pymongo` is imported lazily inside the write path so this module (and its pure
document builders) import — and unit-test — without the driver installed, in
keeping with Module 23 §2's "test the logic without Spark" rule.
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

LANE_METRICS_COLLECTION = "lane_metrics"
ANOMALIES_COLLECTION = "anomalies"


# --- Pure, deterministic document keys (no IO, no clock) ---


def metric_document_id(row: Dict[str, Any]) -> str:
    """Stable key for one lane-window: ``run|lane|window_start``.

    A replayed batch produces the same row and therefore the same id, so the
    upsert replaces rather than duplicates. ``window_start`` is the ISO string
    ``urbanflow_stream._window_bounds`` derived, not a wall-clock read.
    """
    return f"{row['run_id']}|{row['approach_lane']}|{row['window_start']}"


def anomaly_document_id(row: Dict[str, Any]) -> str:
    """Anomalies already carry a unique detector event id — reuse it verbatim."""
    return str(row["event_id"])


def _fields_without_id(row: Dict[str, Any]) -> Dict[str, Any]:
    return {key: value for key, value in row.items() if key != "_id"}


def metric_upsert(row: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Return ``(document_id, fields)`` for an idempotent metric upsert.

    ``fields`` deliberately omits ``_id`` so the write op can pass it to
    ``$set`` without tripping MongoDB's immutable-``_id`` guard; the id lands via
    the query filter on upsert.
    """
    return metric_document_id(row), _fields_without_id(row)


def anomaly_upsert(row: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """``(document_id, fields)`` for an idempotent anomaly upsert."""
    return anomaly_document_id(row), _fields_without_id(row)


# --- Connection cache (one pool per uri, reused across micro-batches) ---

_CLIENTS: Dict[str, Any] = {}


def _get_database(uri: str, db_name: str) -> Any:
    from pymongo import MongoClient  # lazy: the module imports without the driver

    client = _CLIENTS.get(uri)
    if client is None:
        client = MongoClient(
            uri,
            serverSelectionTimeoutMS=2500,
            connectTimeoutMS=3000,
            maxPoolSize=4,
        )
        _CLIENTS[uri] = client
    return client[db_name]


def write_batch(
    uri: str,
    db_name: str,
    metric_rows: List[Dict[str, Any]],
    anomaly_rows: List[Dict[str, Any]],
) -> Dict[str, int]:
    """Upsert one micro-batch into MongoDB; return the counts written.

    Raises on connection/write failure — the caller treats the mirror as
    best-effort so a MongoDB outage never fails the streaming query.
    """
    from pymongo import UpdateOne

    db = _get_database(uri, db_name)
    written = {"metrics": 0, "anomalies": 0}

    if metric_rows:
        ops = [
            UpdateOne({"_id": doc_id}, {"$set": fields}, upsert=True)
            for doc_id, fields in (metric_upsert(row) for row in metric_rows)
        ]
        db[LANE_METRICS_COLLECTION].bulk_write(ops)
        written["metrics"] = len(ops)

    if anomaly_rows:
        ops = [
            UpdateOne({"_id": doc_id}, {"$set": fields}, upsert=True)
            for doc_id, fields in (anomaly_upsert(row) for row in anomaly_rows)
        ]
        db[ANOMALIES_COLLECTION].bulk_write(ops)
        written["anomalies"] = len(ops)

    return written


def close_clients() -> None:
    """Close cached pools. Best-effort; used by shutdown/tests, never the hot path."""
    for client in _CLIENTS.values():
        try:
            client.close()
        except Exception:  # noqa: BLE001 - teardown must not mask the real error
            pass
    _CLIENTS.clear()
