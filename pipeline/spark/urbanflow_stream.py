#!/usr/bin/env python3
"""
Module 23: UrbanFlow Spark Structured Streaming job.

    Kafka `lane-telemetry`
        -> explicit-schema parse (never inferSchema)
        -> event-time 10 s tumbling window per lane
        -> pure `compute_10s_window` + `detect_anomalies`
        -> Parquet lake (`lane_metrics`, `anomalies`) + Kafka `anomaly-events`

The per-window arithmetic lives in `urbanflow/windows.py` and the detector in
`urbanflow/anomalies.py`. Both are pure and unit-tested without Spark, so what
runs in the cluster is the same code the tests cover, and the Lite pipeline in
`pipeline/lite` can be diffed against it on golden data.

At-least-once source, idempotent sink: Kafka offsets are checkpointed, and each
micro-batch writes its own `batch=<id>` directory in overwrite mode. A replay of
the same batch id rewrites the same directory, so a restart cannot append a
second copy of a window it already wrote.
"""
from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Tuple

from urbanflow.anomalies import Ewma, detect_anomalies
from urbanflow.constants import KAFKA_TOPICS, TIMING
from urbanflow.io import Settings, load_settings
from urbanflow.quality import split_finite
from urbanflow.windows import compute_10s_window


_RESERVED_LOG_KEYS = frozenset(
    name for name in logging.makeLogRecord({}).__dict__
) | {"message", "asctime", "taskName"}


class _JsonLogFormatter(logging.Formatter):
    """Module 23 §2: logs are JSON, never free text — one shape a query engine
    can filter on, and `%(message)s` greps do not survive production.

    `extra=` fields are surfaced as top-level keys (module 26 §8 logs reject
    counts this way); without this the gate fires but nothing is queryable."""

    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat().replace(
                "+00:00", "Z"
            ),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key, value in record.__dict__.items():
            if key not in _RESERVED_LOG_KEYS and key not in payload:
                payload[key] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


_handler = logging.StreamHandler()
_handler.setFormatter(_JsonLogFormatter())
logging.basicConfig(level=logging.INFO, handlers=[_handler])
logger = logging.getLogger("UrbanFlowStream")
# Separate logger for the sink-side quality gate (module 26 §8) so reject logs
# are greppable by logger name independently of the batch lifecycle lines.
_quality_log = logging.getLogger("urbanflow.quality")

# Module 12 §3.1: topic names are frozen by module 02 §3 and mirrored in
# `urbanflow/constants.ts` parity (`KAFKA_TOPICS`). A dotted namespace here
# (`urbanflow.lane_telemetry`) would silently consume nothing.
TELEMETRY_TOPIC = KAFKA_TOPICS["laneTelemetry"]["name"]
ANOMALIES_TOPIC = KAFKA_TOPICS["anomalyEvents"]["name"]

# In-memory EWMA per (lane). A restart empties it and every lane re-warms for
# 12 windows before DEMAND_SURGE can fire — that is the honest cost of not
# checkpointing detector state, and it only ever suppresses a detection, never
# invents one.
_EWMA: Dict[str, Ewma] = {}


def _rows_by_window(batch: Iterable[Any]) -> Dict[Tuple[str, str], List[Dict[str, Any]]]:
    """Group a micro-batch of parsed telemetry rows into (lane, window) buckets."""
    grouped: Dict[Tuple[str, str], List[Dict[str, Any]]] = {}
    for row in batch:
        payload = row.asDict(recursive=True) if hasattr(row, "asDict") else dict(row)
        lane = str(payload.get("approachLane", "NB-TR"))
        event_time = payload.get("eventTime")
        if event_time is None:
            continue
        bucket = int(event_time.timestamp() // TIMING["WINDOW_DURATION_S"]) * int(
            TIMING["WINDOW_DURATION_S"]
        )
        key = (lane, str(bucket))
        grouped.setdefault(key, []).append(payload)
    return grouped


def _window_bounds(bucket_s: int) -> Tuple[str, str]:
    """Epoch-second bucket to the ISO window bounds stored in the lake."""
    start = datetime.fromtimestamp(bucket_s, tz=timezone.utc)
    end = datetime.fromtimestamp(bucket_s + int(TIMING["WINDOW_DURATION_S"]), tz=timezone.utc)
    return start.isoformat().replace("+00:00", "Z"), end.isoformat().replace("+00:00", "Z")


def _write_heartbeat(settings: Settings, batch_id: int, windows: int, anomalies: int) -> None:
    """
    Log marker the container healthcheck reads (Module 23 §5).

    A file is used rather than a log line because the healthcheck has to answer
    "is the query alive right now", and a grep over container logs cannot.
    Written to a temporary name then renamed, so a reader never sees a half file.
    """
    path = settings.heartbeat_path
    tmp = f"{path}.tmp"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "batchId": batch_id,
        "windows": windows,
        "anomalies": anomalies,
        "updatedAtMs": int(datetime.now(tz=timezone.utc).timestamp() * 1000),
    }
    with open(tmp, "w", encoding="utf-8") as handle:
        json.dump(payload, handle)
    os.replace(tmp, path)


def process_batch(batch_df: Any, batch_id: int, settings: Settings) -> None:
    """
    Turn one micro-batch into `lane_metrics` rows and anomaly rows.

    Runs on the driver because the window and detector logic is pure Python and
    the batch is a 10-second slice of one intersection — a few hundred rows, not
    a table. Collecting an unbounded stream is the anti-pattern here, not
    collecting a bounded micro-batch.
    """
    rows = batch_df.collect()
    if not rows:
        return

    from pyspark.sql import functions as F  # function-level: the module imports without Spark

    metric_rows: List[Dict[str, Any]] = []
    anomaly_rows: List[Dict[str, Any]] = []

    window_seconds = int(TIMING["WINDOW_DURATION_S"])
    for (lane, bucket), events in _rows_by_window(rows).items():
        window_start, window_end = _window_bounds(int(bucket))
        row = compute_10s_window(events, window_start, window_end, "live")
        row["approach_lane"] = lane
        metric_rows.append(row)

        # Signal state travels on its own topic and is not in this micro-batch, so
        # the indicator is UNKNOWN rather than an assumed green: BLOCKAGE needs a
        # green to be meaningful and must not fire on an assumption.
        detected, state = detect_anomalies(
            row,
            _EWMA.get(lane),
            signal_indication="UNKNOWN",
            window_index=int(bucket) // window_seconds,
        )
        _EWMA[lane] = state
        anomaly_rows.extend(detected)

    # Module 26 §8: no NaN/Infinity reaches the lake. Rejects are counted and
    # logged with their field names — a silently dropped window is exactly the
    # failure this gate exists to make loud.
    metric_rows, metric_rejects = split_finite(metric_rows)
    anomaly_rows, anomaly_rejects = split_finite(anomaly_rows)
    if metric_rejects or anomaly_rejects:
        _quality_log.warning(
            "rejected non-finite rows",
            extra={
                "batchId": batch_id,
                "metricsRejected": len(metric_rejects),
                "anomaliesRejected": len(anomaly_rejects),
                "sampleReasons": [row.get("_reject_reason") for row in (metric_rejects + anomaly_rejects)[:3]],
            },
        )

    from urbanflow.schemas import ANOMALIES_SCHEMA, LANE_METRICS_SCHEMA

    spark = batch_df.sparkSession
    lake_path = settings.lake_storage_path

    # One directory per micro-batch, overwritten on retry: the same batch id
    # rewrites its own directory, so an at-least-once delivery cannot duplicate
    # a window. `coalesce(1)` keeps the small write to one file per batch.
    # Explicit schemas on the way out too — a null-happy inferred schema would
    # silently turn `avg_speed_kmh` into a string column.
    if metric_rows:
        spark.createDataFrame(metric_rows, schema=LANE_METRICS_SCHEMA).coalesce(1).write.mode(
            "overwrite"
        ).parquet(f"{lake_path}/lane_metrics/batch={batch_id}")

    if anomaly_rows:
        spark.createDataFrame(anomaly_rows, schema=ANOMALIES_SCHEMA).coalesce(1).write.mode(
            "overwrite"
        ).parquet(f"{lake_path}/anomalies/batch={batch_id}")
        # Module 22 §5: the lake is not the only consumer. Anomalies also go to
        # the frozen `anomaly-events` topic, keyed by intersectionId, with the
        # `producedAtMs`/`runId` headers the envelope contract requires. The
        # write is per micro-batch and batch_id-stamped above, so a restart
        # re-publishes at most what this batch already decided (at-least-once).
        headers = F.array(
            F.struct(
                F.lit("producedAtMs").alias("key"),
                F.lit(str(int(datetime.now(tz=timezone.utc).timestamp() * 1000))).cast("binary").alias("value"),
            ),
            F.struct(
                F.lit("runId").alias("key"),
                F.col("run_id").cast("string").cast("binary").alias("value"),
            ),
        )
        anomaly_fields = [field.name for field in ANOMALIES_SCHEMA.fields]
        (
            spark.createDataFrame(anomaly_rows, schema=ANOMALIES_SCHEMA)
            .select(
                F.col("intersection_id").cast("string").alias("key"),
                F.to_json(F.struct(*anomaly_fields)).cast("binary").alias("value"),
                headers.alias("headers"),
            )
            .write.format("kafka")
            .option("kafka.bootstrap.servers", settings.kafka_bootstrap_servers)
            .option("topic", ANOMALIES_TOPIC)
            .save()
        )

    # Optional analytics mirror (MongoDB), keyed so a batch replay overwrites
    # rather than duplicates. Best-effort by design: the Parquet lake above is
    # the source of truth, so a MongoDB outage is logged loudly and skipped --
    # never raised -- and cannot stall the query or advance a bad checkpoint.
    if settings.mongo_enabled and (metric_rows or anomaly_rows):
        try:
            from urbanflow.mongo_sink import write_batch

            written = write_batch(
                settings.mongo_uri, settings.mongo_db, metric_rows, anomaly_rows
            )
            logger.info(
                "mongo mirror batch %s: %d metrics, %d anomalies",
                batch_id,
                written["metrics"],
                written["anomalies"],
            )
        except Exception as exc:  # noqa: BLE001 - mirror is best-effort (see above)
            _quality_log.error(
                "mongo mirror failed for batch %s (lake still holds the data)",
                batch_id,
                extra={"batchId": batch_id, "error": str(exc)},
            )

    logger.info("batch %s: %d windows, %d anomalies", batch_id, len(metric_rows), len(anomaly_rows))
    _write_heartbeat(settings, batch_id, len(metric_rows), len(anomaly_rows))


def build_stream(spark: Any, kafka_servers: str) -> Any:
    """Parse the Kafka topic into typed rows with an event-time watermark."""
    from pyspark.sql import functions as F  # imported here so the module imports without Spark

    from urbanflow.schemas import LANE_TELEMETRY_SCHEMA

    raw = (
        spark.readStream.format("kafka")
        .option("kafka.bootstrap.servers", kafka_servers)
        .option("subscribe", TELEMETRY_TOPIC)
        .option("startingOffsets", "latest")
        .option("failOnDataLoss", "false")
        .load()
    )

    parsed = raw.select(
        F.from_json(F.col("value").cast("string"), LANE_TELEMETRY_SCHEMA).alias("e")
    ).select("e.*")

    # Module 23 §3: event time comes from the payload, not from ingestion time,
    # and a 1-minute watermark bounds the state a late record can hold.
    return (
        parsed.withColumn("eventTime", F.to_timestamp("timestamp"))
        .withWatermark("eventTime", "1 minute")
        .filter(F.col("eventTime").isNotNull())
    )


def main() -> int:
    settings = load_settings()
    logger.info(
        "Starting UrbanFlow pipeline | kafka: %s | lake: %s | mongo: %s",
        settings.kafka_bootstrap_servers,
        settings.lake_storage_path,
        settings.mongo_uri if settings.mongo_enabled else "disabled",
    )

    try:
        from pyspark.sql import SparkSession
    except ImportError:
        logger.error("PySpark is not installed. Run inside docker/ or use pipeline/lite.")
        return 1

    builder = (
        SparkSession.builder.appName("UrbanFlow-Streaming")
        .config("spark.sql.shuffle.partitions", str(settings.shuffle_partitions))
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.streaming.checkpointLocation", settings.checkpoint_root)
    )
    # Kafka connector jars are baked into the image (pinned) and passed by path;
    # `--packages` would resolve them from Maven at every start.
    if settings.extra_jars:
        builder = builder.config("spark.jars", settings.extra_jars)
    spark = builder.getOrCreate()

    stream = build_stream(spark, settings.kafka_bootstrap_servers)
    query = (
        stream.writeStream.foreachBatch(
            lambda df, batch_id: process_batch(df, batch_id, settings)
        )
        .queryName("urbanflow_lane_metrics")
        .option("checkpointLocation", settings.lane_metrics_checkpoint)
        .trigger(processingTime="10 seconds")
        .start()
    )

    logger.info("Query %s started; awaiting termination", query.id)
    try:
        query.awaitTermination()
    except KeyboardInterrupt:
        logger.info("Stopping on interrupt")
        query.stop()
    finally:
        if settings.mongo_enabled:
            from urbanflow.mongo_sink import close_clients

            close_clients()
    return 0


if __name__ == "__main__":
    sys.exit(main())
