# Module 53: SQL & Spark SQL Standards

> SQL appears in three places: **Spark SQL / DataFrame expressions** (pipeline), **SQLite** (Durable Object), and optional ad-hoc **DuckDB** analysis over Parquet. One style, three dialect notes.

---

## 1. Style (all dialects)

```sql
SELECT
  lane.approach_lane,
  lane.controller,
  SUM(lane.discharge_count)            AS discharged,
  ROUND(AVG(lane.max_queue_m), 1)      AS avg_max_queue_m
FROM lane_metrics AS lane
WHERE lane.window_start >= TIMESTAMP '2026-11-01 09:00:00'
  AND lane.window_start <  TIMESTAMP '2026-11-01 10:00:00'
GROUP BY lane.approach_lane, lane.controller
HAVING SUM(lane.discharge_count) > 0
ORDER BY lane.approach_lane, lane.controller;
```

| Rule | Detail |
|---|---|
| Keywords | UPPERCASE; identifiers `snake_case`, lowercase |
| Layout | One clause per line; select-list one column per line; leading commas **not** used; 2-space indent |
| Columns | Explicit lists; no `SELECT *` outside exploration |
| Aliases | `AS` always; meaningful (`lane`, not `a`) |
| Joins | Explicit `JOIN … ON …`; never comma joins; state join type |
| Ranges | Half-open `[start, end)` for time windows |
| NULLs | Handle explicitly (`COALESCE`, `IS NULL`); remember `NULL` ≠ `NULL` and aggregates skip NULLs |
| Ordering | `ORDER BY` with a unique tie-breaker when results are asserted |
| CTEs | Name by meaning (`ranked_windows`); prefer CTEs over deep subqueries |
| Comments | Header: purpose, inputs, output grain, owner; inline for non-obvious logic |
| Literals | Typed (`DATE '…'`, `TIMESTAMP '…'`, `INTERVAL`) ; never rely on implicit casts |
| Parameters | Bound parameters (SQLite) or DataFrame API values; **never** f-string user input into SQL |

---

## 2. Spark: DataFrame API vs SQL

Prefer the **DataFrame/Column API** in code (typo-safe, composable); use SQL for readable analytical queries stored under `pipeline/sql/`.

```python
from pyspark.sql import functions as F

agg = (events
  .withWatermark("timestamp", "10 seconds")
  .groupBy(F.window("timestamp", "10 seconds"), "intersectionId", "controller", "approachLane")
  .agg(
      F.count("*").alias("vehicle_count"),
      F.max("laneMetrics.currentQueueLengthMeters").alias("max_queue_m"),
      F.avg("vehicle.speedKmh").alias("avg_speed_kmh"),
  ))
```

Rules: no Python UDFs when a built-in exists; no `SELECT *` in production queries; window/watermark always paired for streaming aggregations; `spark.sql.session.timeZone=UTC`; avoid wide shuffles on tiny data (set partitions low); never `collect()` large results; cache only when reused and measured.

Gotchas to remember:
- `approx_count_distinct` is approximate; use `countDistinct` where exactness matters at this scale.
- Streaming aggregations in **append** mode emit after the watermark passes; **update** mode emits early partials (do not write partials to Parquet).
- `percentile_approx` is approximate; state accuracy parameter when quoting.
- Structured Streaming does not support every SQL feature (e.g., certain joins/outer semantics); consult the docs before designing.

---

## 3. SQLite (Durable Object)

| Rule | Detail |
|---|---|
| Access | Via the DO SQL API with bound parameters |
| Types | SQLite is dynamically typed: **declare** types, validate in code; store time as INTEGER epoch ms; money as INTEGER micro-USD |
| Keys | Explicit `PRIMARY KEY`; indexes on TTL columns |
| Migrations | `schema_version` table; forward-only, idempotent steps |
| Atomicity | Transactions for check-then-write (nonce insert) |
| Limits | Keep rows small; bounded cleanup per alarm run |
| Pragma | Do not tune pragmas blindly in the platform-managed engine; follow Cloudflare docs |

Parameterised example (TypeScript):

```ts
const row = this.ctx.storage.sql
  .exec('SELECT 1 FROM nonces WHERE nonce = ?', nonce).one?.() ?? null;
```

(Use the current API shape from the Cloudflare docs; keep wrappers in `do/sql.ts` so a signature change is a one-file fix.)

---

## 4. DuckDB (optional, developer-only)

```sql
SELECT approach_lane, approx_quantile(pressure_index, 0.95) AS p95
FROM read_parquet('data/lake/lane_metrics/**/*.parquet', hive_partitioning = true)
GROUP BY approach_lane;
```

Not a runtime dependency, not in CI gates; results that are published must be reproduced by a stored script (`pipeline/sql/*.sql` run by a test or `bench`).

---

## 5. Query Review Checklist

- [ ] Grain stated (one row per …).
- [ ] Time range half-open and in UTC.
- [ ] Join keys unique on at least one side (or intentional many-to-many documented).
- [ ] NULL behaviour considered.
- [ ] Deterministic ordering if asserted.
- [ ] No unbounded scans in the live path.
- [ ] Parameters bound, not concatenated.

---

## 6. Anti-Patterns

| ❌ | ✅ |
|---|---|
| `SELECT * FROM t` in code | Explicit columns |
| `WHERE date(ts) = '2026-11-01'` (kills pruning) | Range on the raw column |
| f-string SQL with user input | Bound parameters / Column API |
| Python UDF for `CASE WHEN` | `F.when().otherwise()` |
| `ORDER BY` omitted but test asserts order | Add tie-breaker |
| Writing partial windows to the lake | Append mode after watermark |
