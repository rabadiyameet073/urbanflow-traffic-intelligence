# Skill: spark-pipeline

**Use when:** Working on the PySpark Structured Streaming job.

**Read first:** `backend-engineering/23`, `languages-and-tooling/53`, `system-design/12`

## Rules

1. Explicit schemas; `from_json` with the schema from the contract; bad rows → DLQ.
2. 10 s event-time windows with a 10 s watermark; append mode to the Parquet sink; checkpoint dir per query.
3. Compute metrics per lane window; anomaly rules implemented as testable pure functions (EWMA z-score, stuck-queue, etc.).
4. `spark.sql.session.timeZone=UTC`; low shuffle partitions for the demo.
5. Unit-test transformations on fixtures with a local session.
6. Pin Spark and connector versions to the same minor 🔎.

## Good / Bad

- ✅ `F.window('timestamp','10 seconds')` with `withWatermark`.
- ❌ `from pyspark.sql.functions import *` shadowing `sum`.

## Landmines

- Update output mode emits partial windows; do not write those to the lake.
- First run downloads connector JARs; document or bake into the image.
