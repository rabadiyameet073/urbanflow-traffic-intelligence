# Data Dictionary (Module 26 §5)

Every persisted shape in UrbanFlow, its columns, units, sources and lineage.
This file is maintained against the schemas that actually ship —
`pipeline/spark/urbanflow/schemas.py`, `packages/core/src/contracts.ts`, the DDL
in `packages/edge/src/do/Room.ts` and `packages/web/src/state/storage.ts` — not
aspirationally. Conventions: snake_case columns, UTC timestamps, integer epoch
ms and integer micro-USD in SQLite, additive evolution only within a
`schema_version`.

## 1. Lake (Parquet, Snappy) — owner: Spark

### 1.1 `lane_metrics` (10 s windows; one row per lane per window)

| Column | Type | Nullable | Meaning / unit | Source | Used by |
|---|---|---|---|---|---|
| `window_start` | timestamp UTC | no | Event-time window open | Spark watermark on `timestamp` | SQL 01, anomaly EWMA |
| `window_end` | timestamp UTC | no | `= start + 10 s` | derived | SQL 01 |
| `intersection_id` | string | no | Fixed `IFC-001` for the demo junction | telemetry envelope | join key |
| `controller` | string | no | `fixed` \| `adaptive` \| `live` | envelope | SQL 01 grouping |
| `approach_lane` | string | no | One of the 8 frozen lane ids (`NB-TR`…`WB-L`) | envelope | everything |
| `vehicle_count` | int | no | Vehicles in the lane during the window | windows.py | BLOCKAGE rule, dashboards |
| `weighted_delay` | double | no | Σ(delay × priority weight), s | windows.py | pressure, p95 reports |
| `max_queue_m` | double | no | Longest stopped queue in window, m | windows.py | BLOCKAGE rule, SQL 01 |
| `avg_speed_kmh` | double | yes | Mean moving speed; `null` when no vehicles | windows.py | SQL 01, UI parity checks |
| `discharge_count` | int | no | Vehicles that crossed the stop line | windows.py | SURGE z-score baseline |
| `pressure_index` | double | no | Same formula the controller uses (module 02 §1.5) | windows.py | SQL 01 p95 |
| `run_id` | string | no | `<scenario>-<yyyymmddhhmm>` per run id scheme | envelope | reconciliation, share links |
| `schema_version` | int | no | Row shape version (currently 1) | writer constant | readers gate on it |

Lineage: `core` sim events → Kafka `lane-telemetry` → Spark 10 s windows →
Parquet `lane_metrics` + `lane-metrics` topic.

Layout note (disclosed): the streaming sink writes one idempotent directory per
micro-batch (`lane_metrics/batch=<id>`, overwrite-on-retry, module 23 §5) rather
than hive partitions `date=/controller=` as module 26 §2 sketches; the `date`
predicate in `pipeline/sql/01_*.sql` therefore targets a partition column the
next lake-format revision must add. Tracked in `docs/LIMITATIONS.md`.

### 1.2 `anomalies`

| Column | Type | Meaning / unit | Source | Used by |
|---|---|---|---|---|
| `schema_version` | int | Row shape version (1) | writer | readers |
| `event_id` | string | `<runId>:<tick>:<lane>:<kind>` — the frozen contract format | anomalies.py | dedupe, UI feed |
| `type` | string enum | `BLOCKAGE` \| `DEMAND_SURGE` \| `SIGNAL_STUCK` \| `EMS_DELAYED` | rules | SQL 02 |
| `lane` | string | frozen lane id | window row | SQL 02 |
| `severity` | string enum | `info` \| `warning` \| `critical` | rule table | triage UI |
| `evidence` | array\<string\> | Short structured strings — the only free-ish text allowed | rules | diagnosis panel |
| `window_start` / `window_end` | timestamp UTC | Window the rule fired on | window row | correlation |
| `detected_at` | timestamp UTC | Processing time (wall clock of the batch) | writer | latency audits |
| `run_id` | string | As above | window row | scoping |

Lineage: `lane_metrics` windows + EWMA arrival baseline → deterministic rules →
Kafka `anomaly-events` + Parquet `anomalies`.

## 2. Edge state — DO SQLite (`packages/edge/src/do/Room.ts`) — owner: Edge

All times are integer epoch ms (UTC); all money integer micro-USD. DDL is
`CREATE TABLE IF NOT EXISTS` + a `schema_version` row — forward-only,
idempotent (module 26 §3). Every table has an alarm-driven purge path.

| Table | Columns | Purpose | TTL / purge |
|---|---|---|---|
| `schema_version` | `v INTEGER` | Migration bookkeeping (single row, value 1) | never purged |
| `nonces` | `nonce TEXT PK`, `seen_at INTEGER` | EVP replay rejection (check-and-insert is atomic in the DO) | 5 min, alarm sweep |
| `rl` | `bucket`, `window_start`, `n` (PK `bucket,window_start`) | Rate-limit windows (AI, EVP, replay) | window length + margin |
| `replays` | `id TEXT PK`, `blob TEXT`, `created_at`, `expires_at` | Shared run snapshots (≤ 200 KB, opaque ≥8-char id) | `expires_at` index sweep |
| `replay_hashes` | `content_hash TEXT PK`, `id TEXT` | Idempotent writes: same content → same id | follows `replays` |
| `ai_usage` | `day`, `key`, `calls`, `cost_micro_usd` (PK `day,key`) | Per-IP + global AI counters and the cost meter | day rollover purge |

## 3. Browser — owner: Web user

Namespace `uf_v1_*`; every access is try/catch (blocked storage degrades to
defaults); `resetPlatformData()` clears exactly the namespace. Never secrets,
tokens or user text.

| Key | Value | Rule |
|---|---|---|
| `uf_v1_theme` | `light` \| `dark` \| `system` | read once at startup (`store.initTheme`), written on explicit toggle |
| URL hash / query | share state, `judge=1` | source of truth for shared runs; deliberately not mirrored into storage |

## 4. Files — owners as noted

| Path | Format | Contents |
|---|---|---|
| `packages/bench/out/results.json` | JSON | Paired-seed benchmark; schema §9 of module 25; committed, small |
| `packages/bench/out/ems-sweep.json` | JSON | EVP detection-distance sweep |
| `evals/fixtures/incidents.json` | JSON | 30 labelled eval windows (module 24 §9) |
| `evals/fixtures/responses/<source>/*.json` | JSON | Recorded provider answers; replay is key-free |
| `evals/out/report.md` | generated Markdown | The only source of AI accuracy claims |
| events / recordings | JSON Lines (`.jsonl`) | Streamable, diffable; producer is task T26 |
| tables for people | CSV (UTF-8, header, ISO dates, `.` decimal) | export surfaces |

## 5. Quality gates (module 26 §8)

| Check | Where it lives |
|---|---|
| Zod schema validation | core contracts tests; edge request paths (`ChatSnapshotSchema`, `DiagnosisV1Schema`, `SignedEvpSchema`) |
| Conservation `arrivals = exited + inSystem + denied` | `SimEngine` runner integrity block, surfaced in `results.json` and the Audit panel |
| NaN/Infinity exclusion | edge `isFiniteDeep` sweep pre-parse; core metric tests |
| Timestamp monotonicity | §8 assigns this to the producer test; there is no producer yet (LIMITATIONS item 21), so it is listed as pending, not passing |
| Row-count reconciliation + pyarrow readability | `make test` integration (declared unexecuted, LIMITATIONS item 21) |
| SQL style and header presence | `pipeline/spark/tests/test_sql_style.py` |
