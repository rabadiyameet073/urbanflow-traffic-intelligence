# UrbanFlow Streaming Pipeline

Kafka → Spark Structured Streaming → Parquet, plus a zero-Docker Lite runner.
The design is module 12; the coding standards this directory follows are module
23. Pure logic (`windows.py`, `anomalies.py`) has no Spark session and no IO, so
it is unit-tested without a cluster.

## Quickstart (Docker)

```bash
cd pipeline
make up          # build the image, start Kafka, create the frozen topics, start Spark
make demo        # tail the Spark job
make test        # unit + contract suite (no Docker needed)
make down        # stop; the `lake` volume survives
make clean       # stop and delete the lake volume
```

`make up` creates the six topics from module 12 §3.1 with their frozen
partitions and retention. Spark consumes `lane-telemetry` and writes
`lane_metrics` / `anomalies` Parquet under `/data/lake`, one directory per
micro-batch (`batch=<id>`), so a restarted checkpoint rewrites its own directory
instead of appending a duplicate window.

## Quickstart (Lite, no Docker)

```bash
pnpm --filter @urbanflow/bench run start
```

`lite/urbanflow_lite.ts` shares `@urbanflow/core` contracts and implements the
same 10 s window, EWMA and anomaly rules as the Spark job.

## What this build does not do yet

There is **no producer** in this repository, so nothing can publish to
`lane-telemetry` from `make`. `make test-integration` and `make record` exit
non-zero on purpose instead of pretending to run — see `docs/validation/LIMITATIONS.md`
item 21. The Spark job itself is unexecuted in this environment
(no Docker daemon, no Kafka); the pure logic it calls is covered by pytest.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `spark` exits, log says `PySpark is not installed` | Running the entrypoint outside the image | Use `make up`, or install `pipeline/docker/spark/requirements.txt` |
| Job starts but consumes nothing | Topic name or bootstrap mismatch | Names are frozen (`lane-telemetry`); check `KAFKA_BOOTSTRAP_SERVERS` |
| `NoClassDefFoundError: ...kafka...` | Connector jars missing | The image bakes them from `docker/spark/fetch_jars.py`; rebuild the image |
| `Permission denied` writing `/data/lake` | Volume created by another uid | `make clean && make up` — the image seeds `/data` as uid 10001 |
| Spark container unhealthy | Heartbeat stale (> 120 s) | `docker compose logs spark`; the query stopped consuming |
| `--wait` hangs | Kafka healthcheck failing | `docker compose logs kafka`; the KRaft listener map is wrong |

## Layout

```
pipeline/
  Makefile                 # up | topics | demo | test | down | clean (+ lint/typecheck)
  docker-compose.yml       # pinned images, 127.0.0.1 ports, mem_limit, named lake volume
  docker/spark/            # pinned Dockerfile, requirements, jar fetcher
  spark/urbanflow_stream.py# thin entrypoint: IO + wiring only
  spark/urbanflow/         # schemas, windows, anomalies, constants, io, latency
  spark/tests/             # pytest: window math, EWMA rules, contracts parity
  lite/                    # Node implementation sharing @urbanflow/core
  sql/                     # analytical SQL over the Parquet lake
```
