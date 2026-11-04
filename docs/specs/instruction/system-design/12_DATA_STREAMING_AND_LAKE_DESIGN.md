# Module 12: Data, Streaming & Lake Design

> Kafka, Spark Structured Streaming, Parquet, anomaly detection and Lite mode — designed to be **runnable, honest and replayable**. The pipeline never sits in the control path (ADR-002).

---

## 1. Purpose and Non-Goals

| Purpose | Non-goal |
|---|---|
| Prove the system scales to realistic telemetry volume | Deciding signal phases |
| Windowed lane metrics + anomaly events for the Copilot | Exactly-once end-to-end semantics across Kafka sinks |
| Durable, analysable history (Parquet) | HDFS cluster operations |
| Latency measurement (p50/p95) | Claiming distributed-cluster scale from a single node |

---

## 2. Time Semantics

- **Event time** = simulated time rendered as ISO-8601 UTC (`timestamp`). For recordings the base instant is fixed in the run header.
- **Processing time** = wall clock. Latency = `lane-metrics` emit time − producer wall-clock stamp (`producedAtMs` header/field).
- Producers emit events in simulated-time order per lane; at speed ×10 the event-time rate is 10× wall-clock. Windows and watermarks are defined on **event time**; always state the speed factor beside any latency number.
- Late data: watermark 10 s; later events are dropped from windows and counted (`late_events_total`).

---

## 3. Kafka Design

### 3.1 Topics (names frozen — module 02 §3)

| Topic | Key | Partitions | Retention | Compaction |
|---|---|---:|---|---|
| `lane-telemetry` | `intersectionId:lane` | 3 | 1 h | no |
| `signal-state` | `intersectionId` | 1 | 1 h | no |
| `emergency-events` | `intersectionId` | 1 | 1 h | no |
| `lane-metrics` | `intersectionId:lane` | 3 | 1 h | no |
| `anomaly-events` | `intersectionId` | 1 | 1 h | no |
| `dlq` | source topic | 1 | 24 h | no |

- **Keying** guarantees per-lane ordering within a partition. Partition count is chosen from consumer parallelism (3), not "as many as possible".
- **Single broker** ⇒ replication factor 1 in the demo; say so. Production would use RF ≥ 3, `min.insync.replicas` 2.

### 3.2 Producer settings (kafkajs)

| Setting | Value | Why |
|---|---|---|
| `idempotent: true` | on | No duplicates from producer retries within a session |
| `acks: -1` | all | Durability even on single broker semantics |
| `compression` | gzip/snappy per availability | ≈ 100 msg/s: negligible either way |
| Batching | `linger` ≈ 20–50 ms equivalent via batch send | Throughput without latency blow-up |
| `eventId` | deterministic (`runId:tick:lane:kind`) | Consumer-side dedup across replays/restarts |

### 3.3 Delivery semantics (state them exactly)

- Producer → Kafka: at-least-once with idempotent producer (no dupes per session).
- Kafka → Spark: Structured Streaming offsets tracked in checkpoint.
- Spark → Parquet (file sink + checkpoint): exactly-once file output.
- Spark → Kafka sink: **at-least-once**. Consumers (UI, anomaly) dedup by `eventId`/window key.
- `foreachBatch` side effects must be **idempotent per `batchId`**.

### 3.4 Schema evolution

`schemaVersion: 1` on every event. Unknown or invalid ⇒ route the raw record to `dlq` with `{reason, sourceTopic, receivedAt}`. Additive changes keep the version; breaking changes bump it and keep a reader for N−1 for the demo duration. Spark `StructType`s are **parity-tested** against the zod schemas (a test generates sample events from zod and runs them through the Spark parser).

---

## 4. Spark Job (`pipeline/spark/urbanflow_stream.py`)

### 4.1 Versions — pin and document

- PySpark **3.5.x** (single exact patch pinned in the Dockerfile and `requirements.txt`).
- Kafka connector `org.apache.spark:spark-sql-kafka-0-10_2.12:<same Spark patch>` — Scala suffix and Spark version **must match exactly**; mismatch causes class-loading errors at startup.
- Python 3.11; Java 17 (as required by the chosen Spark build — verify in the Spark docs).

### 4.2 Pipeline

```
Kafka(lane-telemetry) → from_json(explicit StructType, mode=PERMISSIVE → bad rows to dlq)
  → withWatermark("timestamp", "10 seconds")
  → groupBy(window("timestamp","10 seconds"), intersectionId, controller, approachLane)
  → agg(vehicle_count, weighted_delay, max_queue_m, avg_speed, discharge_count, pressure_index)
  → writeStream (append) ×3:  lane-metrics topic · Parquet (date/controller) · foreachBatch(anomaly)
```

Rules:
1. `from pyspark.sql import functions as F` — never `from pyspark.sql.functions import sum` (shadows the builtin).
2. Explicit `StructType`; **no schema inference**.
3. Window aggregates with a watermark use **append** output mode (emits when the watermark passes the window end) — document the resulting ≥ 10 s emission delay in latency reports; do not hide it.
4. `trigger(processingTime="5 seconds")`; `maxOffsetsPerTrigger` set to bound micro-batch size; `spark.sql.shuffle.partitions` = 6–8 locally (default 200 is wasteful on one node).
5. Checkpoints under `/data/checkpoints/<query>`; one directory per query; never share.
6. Weights for `weighted_delay`: AMBULANCE 1000, BUS 8.5, TRUCK 2.0, CAR 1.2, BIKE 1.0 — imported from one constants module mirrored from `contracts.ts`.
7. `pressure_index` uses the **same formula** as the controller (module 02 §1.5); parity-tested on golden windows.
8. `failOnDataLoss=true` in tests (catch real loss), `false` only in documented dev restarts.

### 4.3 Parquet lake layout

```
/data/lake/lane_metrics/date=YYYY-MM-DD/controller=adaptive|fixed/part-*.snappy.parquet
/data/lake/anomalies/date=YYYY-MM-DD/part-*.snappy.parquet
/data/checkpoints/<query>/
/data/reports/latency.json
```

- Snappy compression; partition by `date`, `controller` (low cardinality). Never partition by lane (small-files problem).
- Target 64–256 MB files in production; demo files are small — say so, and show a compaction note in docs.
- Readability test with `pyarrow` (expected columns and dtypes).

---

## 5. Anomaly Detection (Spark `foreachBatch`, mirrored in Lite mode)

Baseline: EWMA mean and variance per `(lane, controller)`, `alpha = 0.1` default, warm-up of 12 windows (2 min) before alerts.

| Anomaly | Rule (initial thresholds — tune on simulated normal windows) | Severity |
|---|---|---|
| `BLOCKAGE` | queue_m z-score > 3 **and** `discharge_count ≈ 0` for 2 windows **and** arrivals unchanged | critical |
| `DEMAND_SURGE` | arrivals and queue both z-score > 2.5 for 2 windows | warning |
| `SIGNAL_STUCK` | same phase green > `G_MAX_S + 10` s | critical |
| `EMS_DELAYED` | ambulance waiting at stop line > 15 s | critical |

Output `{type, lane, severity, evidence[], windowStart, windowEnd, detectedAt}`.

Acceptance: simulate 1000 normal windows ⇒ false-alarm rate < 1 %; injected blockage detected within 2 windows (≤ 20 s); results reported honestly with the thresholds used.

---

## 6. Latency Measurement

`latency_ms = emitted_at(lane-metrics) − produced_at(first contributing event)`; report p50/p95/max and the **speed factor** per run into `reports/latency.json`. Acceptance: p95 < 15 s on the recording scenario (printed, not asserted blindly: the structural floor is window length + watermark).

---

## 7. Lite Mode (`pnpm pipeline:lite`)

- Plain Node, no Docker; same window math, same anomaly rules, same JSON output schemas.
- **Parity test:** the golden dataset produces the same anomaly events (within a stated tolerance) in Lite and Spark.
- Docs state plainly: *"Lite mode is not Spark."* It exists so the web app, tests and demos work on < 8 GB machines.

---

## 8. Recording & Replay

`make record` captures a 3-minute scripted run (blocked lane at t = 60 s, ambulance at t = 120 s) to `pipeline/recordings/run_001/*.jsonl` + `latency.json`. The web "Pipeline view" replays it with a `REPLAY (recorded <date>)` badge. Recordings include the seed, scenario, versions of every component and the host RAM/CPU.

---

## 9. Capacity Arithmetic (illustrative, label it so)

| Quantity | Calculation | Result |
|---|---|---|
| Events/s (producer) | ≈ 100 | 100 msg/s |
| Bytes/day @ 300 B/event | 100 × 300 × 86 400 | ≈ 2.6 GB/day raw JSON |
| Parquet/Snappy | ≈ 4–8× smaller than JSON (measure; do not quote) | measure |
| One junction @ realistic tracking | 8 lanes × ≈ 30 tracked vehicles × 10 fps ≈ 2 400 rec/s | ≈ 40 GB/day (BigData doc's illustration; not our measured load) |

Only **measured** numbers go in RESULTS; this table explains why partitioned columnar storage matters at city scale.

---

## 10. Operational Rules

1. `make up | demo | test | record | down | clean` are the only entry points; README has a 5-command quickstart.
2. Every container has a `mem_limit` (total ≈ 4 GB) and a healthcheck.
3. Image tags pinned (no `latest`); versions recorded in `docs/ARCHITECTURE.md`.
4. Kill-and-restart test: restarting Spark from checkpoint yields no duplicate windows.
5. Ports, memory and Apple-silicon notes are in `pipeline/README.md` troubleshooting.
