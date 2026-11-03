# Module 06: Source Document Reconciliation

> Five source documents describe overlapping but **conflicting** designs. This module lists every known conflict, which side wins, and why. Agents must not "average" sources — follow the resolution column.

---

## 1. Source Inventory

| Short name | File | Role | Binding? |
|---|---|---|---|
| **Playbook** | `URBANFLOW_WINNING_PLAYBOOK.md` | Corrected design + 19-task plan + Muse prompts | Yes (below this pack) |
| **Platform doc** | `SMART_CITY_TRAFFIC_INTELLIGENCE_PLATFORM.md` | Product vision, 8-lane geometry, Meta mapping | Partly (see conflicts) |
| **Hackathon doc** | `META_GLOBAL_AI_DEVELOPER_HACKATHON_DETAILS.md` | Event rules, dates, rubric | Yes for event facts |
| **Blueprint** | `smart_city_traffic_intelligence_blueprint.md` | College Big Data framing, G1–G8 groups, 1 s tick | Background only |
| **BigData doc** | `traffic_signal_bigdata_project.md` | Student Hadoop/Spark framing, N1/N2…, R1–R10 | Background only |

---

## 2. Conflict Register

| # | Topic | Sources disagree | **Resolution** | Reason |
|---|---|---|---|---|
| 1 | Lane model | Platform: `NB-TR/NB-L…`; Blueprint: `G1–G8`; BigData: `N1/N2…` (left-hand traffic, right-turn lanes) | **`NB-TR, NB-L, SB-TR, SB-L, EB-TR, EB-L, WB-TR, WB-L`** | Playbook contracts; matches 4-phase protected-left design |
| 2 | Phases | Platform: NEMA dual-ring 2-phase 40/40; others: 4 compatible groups | **4 phases** `P1_NS_LEFT…P4_EW_THRU`, any two different phases conflict | Small, exhaustively verifiable safety model |
| 3 | Time scales | 1 s decisions (Blueprint); 10 s ticks (BigData/Platform) | **Sim tick 0.1 s; hold logic every tick; re-plan every 10 s** | Physics needs fine dt; planning needs stable windows |
| 4 | Safety minimum green | 7 s (Platform), 10–15 s (Blueprint), 10 s (BigData) | **`G_MIN_S` 7 (safety) + `G_MIN_EFFICIENT_S` 25 (efficiency, tunable 12–40)** | A 7 s hold alone thrashes and loses to fixed-time under balanced demand |
| 5 | Yellow / all-red | 3–5 s / 1–2 s (Blueprint); 3 / 2 (BigData); 3.5 / 2.0 (Platform) | **3.5 s / 2.0 s, never shortened** | Platform values; module 03 I2/I5 |
| 6 | Max green | 40 / 45–60 / 65 | **65 s (EVP hold ≤ 90 s)** | Platform value |
| 7 | Starvation | 90–120 s (Blueprint); 120 s `W_MAX` (BigData) | **`MAX_RED_WAIT_S` 120**, +60 s grace after EVP recovery | Single constant, kernel-enforced |
| 8 | Demand trigger | Queue ≥ 50/100 vehicles (Blueprint, BigData); weighted pressure (Platform) | **Weighted pressure** with queue-length ratio; 50/100 thresholds are *not* used | Absolute counts ignore lane capacity |
| 9 | Decision engine location | BigData: Cloudflare Worker decides; Platform: Edge dispatches phases | **Browser/Worker-thread controller + Kernel decide. Edge is gateway only.** | Judges run only a browser; control loop cannot depend on network |
| 10 | Role of Kafka/Spark in control | Platform diagram: Spark → edge → canvas phase update | **Pipeline observes/stores/detects anomalies; never in the control path** | 10 s micro-batch latency + fragility |
| 11 | Storage | HDFS/Iceberg default | **Parquet on local volume (MinIO optional); HDFS optional profile** | HDFS is heavy; never claim what was not run |
| 12 | Topic names | `vehicle-events` vs `lane-telemetry` | **`lane-telemetry, signal-state, emergency-events, lane-metrics, anomaly-events, dlq`** | Consistency |
| 13 | PySpark snippet | Undefined `telemetry_schema`; `sum` shadows builtin | **Explicit StructType schemas; `from pyspark.sql import functions as F`** | Runnable code |
| 14 | EMS detection distance | 150 m / ETA 10 s | **Parameter, default 300 m; sweep 150/300/500; TIGHT plan reporting** | 10 s < 13.5 s required lead |
| 15 | Result claims | −38 % delay, −50 % queue, −62 % EMS, −36 % fuel | **Placeholders. Published numbers only from `results.json`, per scenario, with CIs** | Rule 00 |
| 16 | "NTCIP 1202 compliant" | Platform doc | **"NTCIP-1202-inspired object model / mapping layer"** | NTCIP 1202 is an SNMP object-definition standard; compliance needs certification |
| 17 | "200 ms hardware fail-safe" | Platform doc | **Simulated watchdog + conflict monitor with measured reversion time** | Hardware property, not software |
| 18 | WebAssembly canvas | Platform doc | **Dropped**: Canvas 2D + Web Worker | Extra risk, no benefit |
| 19 | AI in the loop | "Muse Spark… Signal Adjustments → Edge → Canvas" | **AI proposes bounded params; Kernel + twin verify; human approves** | Safety story and rubric |
| 20 | Application answers | Platform doc §10 | **Obsolete** (applications closed Oct 25); write only true text in the final submission | — |
| 21 | Unsourced statistics | "$88B/yr congestion", "7–10 % survival per minute" | **Do not use unless cited with a real source and date** | Credibility under Impact scoring |
| 22 | Datasets | UTD19 / PeMS / METR-LA (Blueprint, BigData) | **Optional calibration inputs only**; every use cites source + licence; never described as live city data | Simulation-first project |
| 23 | Wrong-side traffic | BigData assumes left-hand traffic | **Right-hand traffic geometry (US-style protected lefts)**; mirror only via explicit config + ADR | Matches NB-TR / NB-L naming |
| 24 | Benchmark fairness | Not specified | **Identical arrival stream (per-lane seeded RNG), denied entries counted, paired seeds, held-out reporting** | Prevents silent cheating |
| 25 | Event dates order | Bonus awards Nov 10 after finals Nov 9 | **Re-verify on the event page** | Possible source typo |

---

## 3. Ideas Worth Keeping From the Background Sources

| Idea | Source | Where adopted |
|---|---|---|
| Hysteresis / enter-exit thresholds | Blueprint | Efficiency hold + `RATIO·cur + FLOOR` margin |
| Sensor `UNKNOWN`/`STALE` is never "zero vehicles" | Blueprint | Chaos mode; perception-noise tests; observation validity flags |
| Conflict matrix as the source of safe concurrency | Blueprint | Phase model; Kernel I1 |
| Decision audit with reason codes | Blueprint | Explainability panel, decision log, `ControlAction.reason` |
| Scale arithmetic (events/s → GB/day) | Blueprint, BigData | `15_PERFORMANCE_AND_CAPACITY_BUDGETS.md` (labelled illustrative) |
| Fixed-time fail-safe on stale data | BigData R9 | Watchdog → `FLASH_RED` → baseline fixed-time |
| Starvation flush logic | BigData R2 | Kernel `MAX_RED_WAIT_S` + EVP recovery fairness |
| Parameter tuning from data, nightly recalibration | BigData §9.4 | Task 5 tune-on-train / report-on-held-out |
| Highway analysis (Phase 1) | BigData | **Out of scope** (listed in LIMITATIONS as future work) |
| Hive / MapReduce | BigData | **Out of scope**; Spark + Parquet only |
