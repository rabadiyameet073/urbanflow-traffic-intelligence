# Module 26: Data Modeling, SQL & Storage

> Every persisted shape in UrbanFlow: Parquet tables, Durable Object SQLite tables, browser storage, files. Plus the SQL (Spark SQL / SQLite / optional DuckDB) conventions used to query them.

---

## 1. Storage Map

| Store | Technology | Contents | Retention | Owner |
|---|---|---|---|---|
| Lake | Parquet (Snappy) on volume (HDFS/MinIO optional) | `lane_metrics`, `anomalies` | demo run | Spark |
| Checkpoints | Spark checkpoint dir | Offsets/state | demo run | Spark |
| Edge state | DO SQLite | nonces, rate-limit windows, replays, AI usage | TTLs | Edge |
| Benchmark outputs | JSON/CSV files in `packages/bench/out` | results, sweeps | committed (small) | Bench |
| Eval fixtures | JSON files in `evals/fixtures` | incidents + recorded responses | committed | Evals |
| Vision outputs | JSON + PNG in `vision/out` | polygons, masks, MAE | committed | Vision |
| Browser | `localStorage`, URL hash | hints dismissed, theme, share state | user | Web |

No relational database server. No user accounts. No PII.

---

## 2. Parquet Schemas

### 2.1 `lane_metrics` (partition: `date`, `controller`)

| Column | Type | Nullable | Notes |
|---|---|---|---|
| `window_start` | timestamp (UTC) | no | Event time |
| `window_end` | timestamp (UTC) | no | `= start + 10 s` |
| `intersection_id` | string | no | |
| `controller` | string | no | `fixed` \| `adaptive` |
| `approach_lane` | string | no | One of the 8 lanes |
| `vehicle_count` | int | no | |
| `weighted_delay` | double | no | priority-weighted |
| `max_queue_m` | double | no | |
| `avg_speed_kmh` | double | yes | null if no vehicles |
| `discharge_count` | int | no | |
| `pressure_index` | double | no | same formula as controller |
| `run_id` | string | no | |
| `schema_version` | int | no | |

### 2.2 `anomalies` (partition: `date`)

`type` (enum string), `lane`, `severity`, `evidence` (array<string>), `window_start`, `window_end`, `detected_at`, `run_id`, `schema_version`.

Rules: snake_case columns; UTC timestamps; no free-text beyond `evidence` (short, structured strings); additive evolution only within a `schema_version`.

---

## 3. Durable Object SQLite

DDL is in module 21 §6.2. Conventions:

| Rule | Detail |
|---|---|
| Time | Integer epoch ms, UTC |
| Money | Integer micro-USD |
| IDs | Random opaque strings (≥ 8 chars for replay, unguessable for rooms) |
| TTL | Alarm-driven cleanup; every table has a purge path |
| Migrations | `schema_version` table; forward-only; each migration idempotent (`IF NOT EXISTS`, guarded `ALTER`) |
| Transactions | Use for multi-statement updates (nonce check + insert) |
| Parameters | Always bound parameters, never string-concatenated SQL |

---

## 4. SQL Style (module 53 has the full guide)

```sql
-- Spark SQL (DuckDB spells the percentile as approx_quantile): windowed lane health, held-out run
SELECT
  approach_lane,
  controller,
  AVG(max_queue_m)               AS avg_max_queue_m,
  PERCENTILE_APPROX(pressure_index, 0.95) AS p95_pressure
FROM lane_metrics
WHERE date = DATE '2026-11-01'
  AND run_id = 'run1001-ns-heavy-tide-202611010900'
GROUP BY approach_lane, controller
ORDER BY approach_lane, controller;
```

- Uppercase keywords, lowercase snake_case identifiers, one clause per line, explicit column lists (no `SELECT *` outside exploration).
- Explicit join conditions; explicit `NULL` handling; never `ORDER BY` without a tie-breaker when results are asserted in tests.
- Date/time literals typed (`DATE '…'`, `TIMESTAMP '…'`).
- Every analytical query that feeds a published number is stored under `pipeline/sql/` with a header comment (purpose, inputs, owner) and is run by a test or script — never copy-pasted from a notebook.
- DuckDB (optional, free) may read Parquet directly for ad-hoc analysis; it is a *developer tool*, not a runtime dependency.

---

## 5. Data Dictionary & Lineage

`docs/DATA_DICTIONARY.md` (generated or maintained with the schemas) lists every column with meaning, unit, source, and which metric uses it. Lineage in one sentence per table:

- `lane_metrics`: Producer (`core` sim events) → Kafka `lane-telemetry` → Spark 10 s windows → Parquet + `lane-metrics` topic.
- `anomalies`: `lane_metrics` windows + EWMA baseline → rules → `anomaly-events` + Parquet.

---

## 6. Browser Storage Rules

| Key | Value | Rule |
|---|---|---|
| `uf_v1_hints` | dismissed hint ids | try/catch on every access; app works without it |
| `uf_v1_theme` | `light|dark|system` | read once at startup |
| Share state | URL hash | Source of truth for runs; never mirrored into localStorage |

- Namespace: `uf_v1_*`; `resetPlatformData()` clears the namespace.
- Never store secrets, tokens, or user text.
- Read once on mount, write on explicit state transitions (not per keystroke).
- Handle blocked storage (private windows) without errors.

---

## 7. File Formats

| Use | Format | Why |
|---|---|---|
| Events/recordings | JSON Lines (`.jsonl`) | Streamable, diffable |
| Results/reports | JSON (+ generated Markdown) | Machine + human |
| Tables for people | CSV (UTF-8, header, ISO dates, `.` decimal) | Export button |
| Large analytic | Parquet | Columnar |
| Diagrams | Mermaid in Markdown, SVG exports | Reviewable |

---

## 8. Data Quality Gates

| Check | Where |
|---|---|
| Schema validation (zod/StructType) | Producer, Spark, edge |
| Conservation `arrivals = exited + inSystem + denied` | Sim tests, Audit panel |
| Row-count reconciliation (events in vs windows out vs Parquet rows) | `make test` |
| No NaN/Infinity in metrics | Core tests + Spark `F.isnan` filter counting rejects |
| Timestamp monotonicity per lane | Producer test |
| Parquet readability with `pyarrow` | `make test` |
