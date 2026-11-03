# Master QA Report

> Environment: Windows 11 22H2, Node via pnpm, Vitest 2.x.
> Commit under test: working tree on `build/urbanflow`.
> Test command: `pnpm vitest run` → **11 files, 127 tests — 119 passing, 8 skipped** (the skips are the gated regression suite `packages/bench/test/regression.test.ts`, which runs via `pnpm test:regression` — executed 2026-11-02: **8/8 passed**). Pipeline suite executed the same day: `cd pipeline; python -m pytest` → **51 passed** (Python 3.12.10).
> Documentation gate: `node scripts/docs-check.mjs` → **exit 0**.
> Fitness gate: `node scripts/fitness.mjs` → **7 of 7 checks pass**.

## 0. How to Read This Report

The previous revision of this file marked all 33 matrix rows `PASS`, including
rows for checks that were never executed (browser cross-runtime hashes, axe
scans, gitleaks, Lighthouse, mutation testing). That is exactly the failure mode
Rule 00 exists to prevent, so the rows have been re-graded against evidence that
exists in this repository.

| Grade | Meaning |
|---|---|
| **PASS** | An automated test in the suite asserts the pass criterion, and it is named in the Evidence column |
| **PARTIAL** | Part of the criterion is covered by a test or by a generated artefact; the rest is not |
| **NOT RUN** | No test, log or report exists. Read as "unknown", never as "passing" |

Nothing in this file is graded PASS without a test name behind it.

---

## 1. Matrix

| ID | Layer | Check | Grade | Evidence |
|---|---|---|---|---|
| QA-01 | Safety | No conflicting non-red indications (I1) | **PASS** | `core.test.ts` → "enforces Invariant I1: no conflicting non-red indications" |
| QA-02 | Safety | Yellow 3.5 s and all-red 2.0 s never shortened (I2) | **PASS** | `core.test.ts` → "enforces Invariant I2: transitions pass through yellow (3.5s) and all-red (2.0s)" |
| QA-03 | Safety | Max red wait bounded at 120 s (I4 anti-starvation) | **NOT RUN** | No test asserts a per-lane 120 s bound. The constant exists; the assertion does not |
| QA-04 | Safety | Watchdog reverts to FLASH_RED and recovers via ALL_RED (I6) | **PASS** | `system_design.test.ts` → three watchdog tests plus "orchestrates clean safety recovery: FLASH_RED -> ALL_RED (2.0s) -> Baseline Green"; also `core.test.ts` I6 |
| QA-05 | Safety | Illegal requests rejected with reason codes | **PARTIAL** | `platform_specifications.test.ts` → "Digital-Twin What-If: rejects proposals that touch non-configurable safety parameters". Kernel-level reason-code counters are not separately asserted |
| QA-06 | Safety | Mutation score ≥ 85 % | **NOT RUN** | No mutation harness in the repository. No score may be claimed |
| QA-07 | Determinism | Same seed → identical state hash | **PASS** | `core.test.ts` → "achieves bit-identical state hashes across independent runs with the same seed" |
| QA-08 | Determinism | Node vs browser hash equality | **NOT RUN** | No browser test harness was executed |
| QA-09 | Determinism | Hash independent of render rate | **PARTIAL** | `worker_protocol.test.ts` → "advances simTimeS by exactly one step per tick" pins simulated time to tick count rather than wall time, and the worker's accumulator caps ticks per frame. No test drives the real accumulator at two frame cadences |
| QA-10 | Determinism | Replay reproduces the exact run | **PASS** | `worker_protocol.test.ts` → "restores an exactly equal hash after a scrub back" (exact string equality against the pre-scrub hash), "replays operator edits at the tick they were applied", and since 2026-11-02 also "merges a patch into the adaptive controller and replays it identically", "is bit-identical across two independently replayed worlds" (EVP timeline parity) and "rebuilds an identical world through applyExternalCommand" (debug-bundle log replay) |
| QA-11 | Safety | EVP feasibility classified (TIGHT / OK) | **PASS** | `core.test.ts` → "classifies a 150 m approach as TIGHT with the measured 9.5 s shortfall (§5.2)" and "classifies a 300 m approach as OK and reports no shortfall (§5.2)"; also measured end-to-end in `packages/bench/out/ems-sweep.json` (150 m → 5/5 TIGHT, 300/500 m → 5/5 OK) |
| QA-12 | Safety | Preemption produces zero safety violations | **PARTIAL** | Kernel conflict counter is 0 in all 8 benchmark scenarios; no dedicated preemption-invariant test |
| QA-13 | Backend | HMAC valid / tampered / expired / replayed | **PASS** | `edge.test.ts` → 4 tests: accepted, `409 NONCE_REPLAY`, `401 BAD_SIGNATURE`, `401 TIMESTAMP_SKEW` |
| QA-14 | Backend | Payload size limit enforced before parsing | **PASS** | `edge.test.ts` → "rejects an oversized payload with 413 before parsing" |
| QA-15 | Backend | Rate limiting returns 429 with `Retry-After` | **PASS** | `edge.test.ts` → "rate limits a second fresh request from one source with 429" |
| QA-16 | Backend | Nonce store rejects replays atomically | **PARTIAL** | `edge.test.ts` → `409 NONCE_REPLAY` against the in-memory room. The SQLite Durable Object path (`INSERT OR IGNORE` + `rowsWritten`) is not exercised by a test |
| QA-17 | AI | Malformed model output falls back | **PARTIAL** | `edge.test.ts` → "diagnose rejects a missing window with 400"; zod rejection of a malformed provider body is not separately asserted |
| QA-18 | AI | Template fallback works with Meta unavailable | **PASS** | `edge.test.ts` → "diagnose returns the documented envelope via Template fallback" |
| QA-19 | AI | AI advises, never controls | **PASS** | `edge.test.ts` → "chat refuses to override signals and caps question length"; no route in `index.ts` writes `SignalState` |
| QA-20 | AI | Prompt versioning and structured output | **PARTIAL** | `PROMPTS` is versioned (`diagnose.v1` etc.) and documented in `docs/muse-prompts/`; no test asserts prompt-to-schema coupling |
| QA-20b | AI | Copilot eval harness runs end to end (Module 24 §9) | **PARTIAL** | Executed 2026-11-02: `pnpm eval:gen -- --force` → 30 labelled incidents; `pnpm eval:replay` → `evals/out/report.md` with the heuristic baseline measured live (top-1 23.3 %, top-2 40.0 %, severity 36.7 %, cost $0.0000). Provider rows (`llama-fallback`, `muse-spark`) have no recorded fixtures — `pnpm eval:live` needs a `META_API_KEY`, so the report omits them rather than estimating, and the regression floor stays "no floor recorded" |
| QA-21 | Pipeline | Spark window aggregation matches fixture | **PARTIAL** | Executed 2026-11-02 (`cd pipeline; python -m pytest` — **51 passed**). `test_golden.py → test_golden_window_aggregation` pins the pure `compute_10s_window` against hand-derived golden fixtures, and `test_windows.py` (11 tests) covers the aggregation logic. The PySpark *session* path itself is not exercised without `pyspark` installed (the integration files error at collection) — the pure logic the Spark job wraps is what passes |
| QA-22 | Pipeline | Bad records routed to DLQ | **PARTIAL** | `test_quality.py` (12 tests) asserts the sink-side gate: `split_finite` rejects NaN/±∞ rows with a `_reject_reason` and passes finite rows untouched. The `dlq` Kafka topic exists in `constants.py` and the Makefile, but routing rejections *into* that topic needs a live Kafka — not run here |
| QA-23 | Pipeline | Anomaly rules TP/TN/boundary | **PASS** | Executed 2026-11-02: `test_anomalies.py` (7 tests, EWMA/z-score/blockage plus the §4 floor that 1 000 normal windows false-alarm under 1 %) and `test_golden.py → test_golden_anomalies` (4 parametrised cases asserting type, severity and event_id per case) all pass |
| QA-24 | Pipeline | Lite mode parity with Spark | **NOT RUN** | No parity test exists |
| QA-25 | Pipeline | Runs without Docker | **NOT RUN** | `pipeline:lite` is not wired as an npm script; the lite path is unverified |
| QA-26 | Frontend | Keyboard-complete, ARIA present, zero critical axe findings | **NOT RUN** | ARIA attributes and a focus ring exist in code; **no axe scan was run** |
| QA-27 | Frontend | Contrast ≥ 4.5:1 text / 3:1 graphics | **NOT RUN** | Token pairs exist; no measured ratio is recorded. See `docs/ACCESSIBILITY.md` |
| QA-28 | Frontend | Reduced motion honoured | **PARTIAL** | `@media (prefers-reduced-motion: reduce)` present in `styles/base.css` and `styles/components.css`, and checked in `render/canvas.ts`; not asserted by a test |
| QA-29 | Frontend | No horizontal overflow 320–1600 px | **NOT RUN** | No viewport sweep was performed |
| QA-30 | Cross | Headless sim ≥ 100× real time | **PASS** | `system_design.test.ts` → "headless simulation achieves >= 100x real-time speedup" |
| QA-30b | Cross | Frame p95 ≤ 20 ms; JS ≤ 350 KB | **PARTIAL** | Bundle measured on the 2026-11-02 build: main chunk 103.47 KiB raw / 33.51 KiB gz, worker 108.35 KiB raw / 28.09 KiB gz, camera 58.45 KiB raw / 13.92 KiB gz, copilot 2.65 KiB raw / 1.39 KiB gz — **75.69 KiB gzipped in total** (`fitness.mjs` figure) against the 350 KB gzip budget of Module 01, plus 34.18 kB CSS (6.42 kB gz). Frame p95 is still unmeasured — no Lighthouse run |
| QA-31 | Cross | Security headers and CSP set | **PASS** | Asserted indirectly by every `edge.test.ts` response (headers built by `http/index.ts`); `403`/`CORS`/`Vary` are directly asserted |
| QA-31b | Cross | No secrets in history (`gitleaks`) | **NOT RUN** | gitleaks was not available. Must be run by a human before publishing |
| QA-32 | Cross | Paired seeds with bootstrap CI | **PASS** | `bench.test.ts` → "runs paired-seed comparison with reproducible bootstrap confidence intervals"; artefacts regenerated on held-out seeds **1001–1005** |
| QA-33 | Cross | Published numbers match the artefacts | **PASS** | `node scripts/docs-check.mjs` → exit 0, 8 scenarios + 3 sweep points verified. Wired into `pnpm verify` |
| QA-34 | Frontend | Simulation runs off the main thread behind a versioned, validated protocol | **PARTIAL** | `worker_protocol.test.ts` → "rejects a command from a different protocol version", "packs a frame at the documented stride and never exceeds the ceiling", "drives both twins from one seed with identical arrivals". The build emits a separate `dist/assets/sim.worker-*.js` chunk, so the Worker is bundled as a Worker rather than inlined. The thread hop and the heartbeat are still not observed, because that needs a browser harness |
| QA-35 | Cross | Contracts are frozen and fail on unintended change (Module 02 §2) | **PASS** | `platform_specifications.test.ts` → four freeze tests pinning the lane→phase and phase→lane tables, the vehicle class table against Module 02 §1.2, the adaptive defaults with both sides of every bound, the untunability of the five safety timings, and the HCM thresholds |
| QA-36 | AI | An unsafe proposal is refused, end to end (Module 04 §3.4) | **PARTIAL** | `platform_specifications.test.ts` → the three what-if tests, including "out-of-bounds values are refused before any simulation runs" and "rejects proposals that touch non-configurable safety parameters"; `worker_protocol.test.ts` → "accepts an in-bounds patch on the wire and refuses an out-of-bounds one" and "never lets a what-if proposal reach the kernel via the wire". Since 2026-11-02 the *approval* half is wired too — `setAdaptiveParams` command, recorded and replayable in `TwinWorld`, and the "Propose adaptive tuning" button exposes Approve only on an approved verdict — but no browser test clicks either button |
| QA-37 | Cross | Architectural fitness functions run automatically (Module 10 §8) | **PARTIAL** | `node scripts/fitness.mjs` → 7 of 7: core purity, dependency law, no cycles, single `SignalState` writer, 75.69 KiB gz against the 350 KiB budget, no secret value in the bundle, hardening headers present. Wired into `pnpm verify`. Two properties from §8 are still not automated — determinism across two browsers (Node only here) and zod↔Spark schema parity — and gitleaks runs in CI but was never executed in this environment |
| QA-38 | Core | Chaos randomness and clocks are deterministic (Rule 07) | **PASS** | `system_design.test.ts` → "perception noise replays identically from a seed", with a guard that the noise actually perturbs. Backs the change from `Math.random`/`performance.now`/`new Date` to injected streams and the simulated epoch |
| QA-39 | Observability | Module 16 §4.1 metrics reach the audit panel | **PASS** | `worker_protocol.test.ts` → "Kernel observability reaches the worker boundary (Module 16 §4.1)" asserts ticks, zero conflicts, the green-seen window against `TIMING.G_MIN_S`, and both compliance percentages; `core.test.ts` → "counts each decision once, with its reason and shortfall (Module 16 §4.1)" asserts accepted/rejected counts, the per-reason map, the 9.5 s shortfall, that an idempotent replay is not counted twice, and that `reset()` clears them. `updateAuditPanel` renders both |

---

## 2. Summary

| Grade | Count |
|---|---|
| PASS | 19 |
| PARTIAL | 12 |
| NOT RUN | 11 |
| **Total rows** | **42** (33 matrix items, nine split) |

There are no known failures. There are 11 unknowns, and they are listed above
rather than absorbed into a pass count.

## 3. Blocking Items Before Submission

These must be run and their output filed beside this report:

1. `gitleaks detect --log-opts=--all` — QA-31b
2. axe or equivalent accessibility scan — QA-26
3. Contrast measurement on both themes — QA-27
4. Viewport sweep 320–1600 px — QA-29
5. Lighthouse run on the built bundle — QA-30b
6. Browser-vs-Node state-hash comparison — QA-08
7. ~~`pytest` on the pipeline suite — QA-21..23~~ — **executed 2026-11-02**: 51 passed; the residue is the live PySpark-session and DLQ-routing paths (QA-21/22 remain PARTIAL, they need Docker)
8. A test for the 120 s red-wait bound — QA-03
9. A browser harness that spawns the real Worker, so the thread hop, the frame
   pool and the heartbeat are observed rather than inferred — QA-34

Until those exist, this report describes the software as **partially verified**,
which is the accurate description.
