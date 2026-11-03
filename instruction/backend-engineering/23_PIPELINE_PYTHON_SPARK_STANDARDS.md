# Module 23: Pipeline Engineering — Python, Spark, Docker

> Standards for `pipeline/` (Kafka producer, PySpark job, anomaly logic, Lite mode, Docker Compose). The design is in module 12; this module is *how the code is written*.

---

## 1. Layout

```
pipeline/
  README.md                       # 5-command quickstart + troubleshooting
  Makefile                        # up | demo | test | record | down | clean
  docker-compose.yml              # profiles: default, hdfs, s3
  docker/
    spark/Dockerfile              # pinned base, non-root, pinned pyspark + connector
    producer/Dockerfile
  spark/
    urbanflow_stream.py           # job entrypoint (thin)
    urbanflow/
      __init__.py
      schemas.py                  # StructType definitions (mirrors contracts.ts)
      windows.py                  # pure window aggregation expressions
      anomalies.py                # pure anomaly rules + EWMA
      constants.py                # weights, thresholds (mirrors contracts)
      io.py                       # Kafka/Parquet/DLQ wiring
      latency.py
    tests/                        # pytest
      golden/                     # hand-built DataFrames and expected outputs
  recordings/run_001/*.jsonl
  lite/                           # Node implementation (shares core)
```

Rule: **pure logic** (`windows.py`, `anomalies.py`) has no Spark session creation and no IO; it takes DataFrames/records and returns DataFrames/records. The entrypoint wires IO.

---

## 2. Python Standards (full: module 52)

- Python **3.11**; type hints everywhere; `mypy --strict` on `urbanflow/`; `ruff` (lint + format) with the repo config; `pytest`.
- No bare `except`; no `print` (use `logging` with JSON formatter); no mutable default args.
- Config via environment variables parsed once into a frozen `Settings` dataclass; **no** config reads deep in functions.
- Constants mirrored from `contracts.ts` live in one module with a **parity test** that parses `contracts.ts` constants (or a generated JSON) and compares.

---

## 3. Spark Coding Rules

| Rule | Why |
|---|---|
| Prefer built-in functions over Python UDFs | UDFs serialise rows to Python, kill performance, block optimisation |
| If a UDF is unavoidable, use `pandas_udf` and document why | Vectorised |
| `from pyspark.sql import functions as F`, `types as T` | Avoid shadowing `sum`, `max`, `min`, `abs` |
| Explicit schemas; never `inferSchema` | Determinism, speed, safety |
| No `collect()`/`toPandas()` on unbounded data; in `foreachBatch` only on small aggregated frames | Driver OOM |
| Idempotent sinks keyed by `batch_id` in `foreachBatch` | Restart safety |
| One streaming query ⇒ one checkpoint dir | Corruption avoidance |
| `.coalesce()` before small writes only when measured helpful | Avoid shuffles |
| Set `spark.sql.shuffle.partitions` (6–8 locally) | Default 200 is wasteful |
| `spark.sql.session.timeZone=UTC` | No timezone surprises |
| Name each streaming query (`.queryName(...)`) | Observability |
| Use `F.col(...)` and column expressions, not string SQL fragments built with f-strings | Injection/typo safety |
| Handle `null`s explicitly (`F.coalesce`, `when/otherwise`) | Silent wrong aggregates |
| Never rely on row order | Spark gives none |

---

## 4. Pure Anomaly Logic (testable without Spark)

```python
@dataclass(frozen=True)
class Ewma:
    mean: float
    var: float
    n: int

def ewma_update(s: Ewma, x: float, alpha: float = 0.1) -> Ewma:
    if s.n == 0:
        return Ewma(mean=x, var=0.0, n=1)
    d = x - s.mean
    mean = s.mean + alpha * d
    var = (1 - alpha) * (s.var + alpha * d * d)   # West's EW variance update
    return Ewma(mean=mean, var=var, n=s.n + 1)

def zscore(s: Ewma, x: float, eps: float = 1e-6) -> float:
    return (x - s.mean) / max(s.var ** 0.5, eps)
```

- State is a small DataFrame/Parquet (or Spark stateful op) keyed by `(lane, controller)`; the Lite implementation uses a `Map`.
- Warm-up: no alert until `n ≥ 12` windows.
- Tests: hand-built windows → expected anomalies; 1 000 normal windows → false-alarm rate < 1 %; EWMA numerical correctness against a reference implementation (`numpy`).

---

## 5. Docker & Compose Rules

| Rule | Detail |
|---|---|
| Pin images | Exact tags (no `latest`); record in `docs/ARCHITECTURE.md` |
| Non-root | `USER 10001`; no `--privileged`; no host networking |
| Healthchecks | Kafka (topic list), Spark (query status endpoint or log marker) |
| `mem_limit` | Each service; total ≈ 4 GB |
| Volumes | Named volumes for `/data`; no bind-mounting the repo root writeable into containers that run untrusted code |
| Multi-stage | Build deps in builder, slim runtime |
| Layer cache | Copy requirements first |
| `.dockerignore` | `node_modules`, `.git`, `data`, `out` |
| Secrets | None in images; pass via env at runtime; this pipeline needs none |
| Ports | Bind to `127.0.0.1` only (`127.0.0.1:9092:9092`) |
| Profiles | `hdfs`, `s3` optional; default = Parquet on volume |

Compose skeleton (shape only):

```yaml
services:
  kafka:
    image: apache/kafka:<pinned>
    mem_limit: 1g
    ports: ["127.0.0.1:9092:9092"]
    healthcheck: { test: ["CMD-SHELL","/opt/kafka/bin/kafka-topics.sh --bootstrap-server localhost:9092 --list"], interval: 10s, retries: 10 }
  spark:
    build: ./docker/spark
    depends_on: { kafka: { condition: service_healthy } }
    mem_limit: 2g
    volumes: ["lake:/data"]
volumes: { lake: {} }
```

---

## 6. Makefile Contract

| Target | Does |
|---|---|
| `make up` | Start Kafka + Spark, create topics |
| `make demo` | `up` + producer + tail logs |
| `make test` | Integration: produce 60 s with injected blockage at t = 20 s; assert metrics for all 8 lanes, Parquet readable (pyarrow), BLOCKAGE within 2 windows, latency p95 printed, restart-from-checkpoint without duplicate windows |
| `make record` | 3-minute scripted run → `recordings/run_001` |
| `make down` / `make clean` | Stop / remove volumes |

Targets are `.PHONY`, use `set -euo pipefail`-style recipes (`SHELL := bash`, `.SHELLFLAGS := -eu -o pipefail -c`), and fail loudly.

---

## 7. Testing Pyramid for the Pipeline

| Level | Tool | Scope |
|---|---|---|
| Unit | pytest | EWMA, anomaly rules, window math on tiny DataFrames |
| Contract | pytest + generated samples | zod→JSON samples parse through `StructType`; wrong types → DLQ |
| Integration | `make test` | Real Kafka + Spark |
| Parity | pytest + Node | Lite output ≈ Spark output on golden data |
| Soak (optional) | `make demo` 30 min | Memory stable |

---

## 8. Anti-Patterns

- `df.collect()` on a stream result inside a loop.
- `inferSchema`/`schema_of_json` in production paths.
- Using `time.sleep` to "wait for Kafka" instead of healthchecks.
- Hidden global `SparkSession` state in helpers.
- Unpinned `pip install pyspark` (connector mismatch).
- Quoting latency without stating speed factor and window/watermark floor.
