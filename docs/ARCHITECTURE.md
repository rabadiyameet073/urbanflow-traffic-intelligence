# UrbanFlow AI — Architecture

> Simulation-only prototype. No physical signal hardware, no certified safety function. See [LIMITATIONS.md](LIMITATIONS.md).

## 1. Shape of the System

```
                    ┌──────────────────────────────────────────────┐
   browser          │  packages/web — operator dashboard           │
                    │  vanilla TS · Canvas 2D · sim in a Worker    │
                    │  no framework · tokens only · WCAG 2.2 AA    │
                    └───────────────┬──────────────────────────────┘
                                    │ fetch (JSON, zod-validated both sides)
                    ┌───────────────▼──────────────────────────────┐
   edge             │  packages/edge — Cloudflare Worker           │
                    │  router · CORS · HMAC · budget guard         │
                    │  Durable Object (nonces, rate limits, WS)    │
                    │  copilot chain: Muse Spark → Llama → template│
                    └───────────────┬──────────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────────────┐
   core             │  packages/core — pure, deterministic         │
                    │  contracts · sim engine · controllers        │
                    │  safety kernel · EVP · metrics · stats       │
                    └───────────────┬──────────────────────────────┘
                                    │
                    ┌───────────────▼──────────────────────────────┐
   data             │  pipeline/ — Kafka (KRaft) → PySpark         │
                    │  Structured Streaming → Parquet lake         │
                    │  + TypeScript "lite" fallback (no JVM)       │
                    └──────────────────────────────────────────────┘
```

The control loop is entirely inside `packages/core` and runs in the browser. The edge gateway, the pipeline and the copilot are all **observation and advice**: the signal keeps running correctly if every one of them is unavailable.

## 2. Dependency Rule

`core` depends on nothing but `zod`. `edge`, `web` and `bench` depend on `core`. `db` is a shared persistence package that depends only on `core` (it owns the `mongodb` driver); `edge` imports `@urbanflow/db`. Nothing depends on `web`, and `core` never imports from `edge`, `web`, `bench` or `db`. This is what makes the engine testable in Node and reusable in a Worker. The two shareable packages (`core` and `db`) are recorded in [ADR-0021](adr/0021-shared-db-package.md).

Enforced by: `tsc -b` project references and a flat import graph in `scripts/fitness.mjs` (`checks.deps` / `checks.cycles`) — any violation is a build error, not a convention.

## 3. Determinism

| Mechanism | Detail |
|---|---|
| Fixed timestep | `TIMING.SIM_DT_S = 0.1`; the engine never reads a clock |
| Independent RNG streams | `splitRng(seed, "arrivals:NB-TR")` → one `mulberry32` stream per lane per concern, so adding a lane cannot shift another lane's arrivals |
| No floats from the platform | No `Math.random`, no `Date.now`, no `performance.now` inside `core` |
| State hash | FNV-1a over a canonical byte layout (`hashState`) for replay comparison |
| Canonical JSON | Sorted-key serialisation (`canonical-json.ts`) so HMAC inputs are byte-stable |

Consequence: the same seed produces the same run on any machine, and the benchmark's paired seeds are meaningful rather than approximate.

## 4. Core Modules

| File | Responsibility |
|---|---|
| `contracts.ts` | **Single source of truth.** zod schemas for `SignalState`, `Observation`, `EvpRequest`, `EvpDirective`, `SimConfig`, `DomainEvent`, metrics. Every wire type is inferred from here |
| `sim/engine.ts` | Microscopic simulation: demand generation, IDM car-following, incident obstacles, lane assignment, exit accounting, domain events |
| `sim/lane.ts` | Struct-of-arrays lane: `pos`, `vel`, `typ`, `wait`, `stops`, `flags`, `order` as typed arrays; free-list slot reuse |
| `control/kernel.ts` | **The only writer of `SignalState`.** Enforces I1–I6, owns the phase machine, exposes `failSafe()` |
| `control/pressure.ts` | `Pressure(lane) = α·N + β·Σ(W_v·wait_v)/10 + γ·10·queueLengthM/laneLengthM` |
| `control/adaptive.ts` | Phase selection from pressure with a switching-cost guard |
| `control/fixed.ts` | Fixed-time cycler — the benchmark baseline, and a real fallback |
| `control/evp.ts` | EVP validation (idempotency, storm guard, nonce, rate limit, plausibility) and the IDLE→PRECLEAR→EMS_GREEN→RECOVERY machine |
| `control/watchdog.ts` | Reversion monitor and fail-safe trigger |
| `control/what_if.ts` | Twin simulation for "what happens if I approve this proposal" |
| `control/ntcip1202.ts` | NTCIP-inspired phase status bitmask projection (not SNMP-compliant) |
| `metrics/metrics.ts` | `avgDelayS`, `personDelayS`, `throughputVph`, `maxQueueM`, LOS bands, fuel and CO₂ |
| `scenarios.ts` | Named demand scenarios used by the bench and the UI |
| `vision/camera_mode.ts` | Camera-mode geometry helpers for the SAM-generated mask overlay |
| `helpers/` | `rng`, `hash`, `hmac`, `canonical-json`, `stats` (bootstrap CI), `share-codec`, `debug-bundle` |

## 5. The Safety Kernel

The kernel is the boundary between "a proposal" and "a signal". Nothing else may construct a `SignalState`.

```
controller.decide(obs) ─┐
evpManager.step(obs,dt) ─┼─→ kernel.step(action, directive, dt) ─→ SignalState
human "approve" ────────┘            │
                                     └─ refuses, and records why
```

Invariants and the tests that cover them are listed in [SAFETY_CASE.md](SAFETY_CASE.md). The important architectural property: **a controller cannot express an unsafe action.** The request type has no field for "shorten yellow". Unsafe intent is unrepresentable, not merely rejected — which is why the kernel's conflict counter can be asserted to zero.

## 6. Edge Gateway

| Module | Responsibility |
|---|---|
| `index.ts` | Route table, origin gate, uniform error envelope, metric wrapper, request-id propagation |
| `router.ts` | Path matching that distinguishes `404 NOT_FOUND` from `405 METHOD_NOT_ALLOWED` |
| `http/index.ts` | Security headers, CORS with `Vary: Origin`, cache policy (`max-age=5` only on `/api/health`), JSON parsing with depth-limited NaN/Infinity rejection |
| `security/index.ts` | Daily-salted IP hashing, EVP signature verification, lane and plausibility checks |
| `do/Room.ts` | SQLite Durable Object: atomic `INSERT OR IGNORE` nonce store, rate-limit windows, replay log, AI usage ledger, alarm-driven TTL cleanup, WebSocket fan-out |
| `do/RoomClient.ts` | RPC client over DO `fetch("/rpc")`, with an explicit in-memory fallback for local dev |
| `budget/guard.ts` | Per-IP and per-source limits; AI limits degrade silently to the template provider |
| `copilot/router.ts` | Provider chain, response cache, circuit breaker, wire-envelope conversion |
| `copilot/providers/meta.ts` | Muse Spark client with structured outputs and numeric provenance validation |
| `copilot/providers/template.ts` | Deterministic fallback that refuses unsafe requests and never echoes input |
| `metrics.ts` | Integer micro-USD cost accounting, WebSocket gauge, storage gauge |

### Request order (deliberate)

`method → origin → size → content-type → schema → HMAC → nonce → rate limit → plausibility → handler`

Rate limiting sits **after** the nonce check on purpose: the API promises that a retried nonce returns the same decision, and a `429` would break that promise. This deviation from the "rate limit first" heuristic is documented in the handler itself.

### Copilot is advisory-only

The copilot returns text. It has no route that writes a signal state, and the UI renders its output in a panel that a human must act on. Numbers in a diagnosis are checked against the input window (`verifySemanticNumbers`) — an ungrounded number fails validation and the response falls back to the template provider rather than being shown.

## 7. Web Dashboard

Eleven modules, no framework. Paths are relative to `packages/web/src`:

| Module | Responsibility |
|---|---|
| `main.ts` | Bootstrap: mount the view, route frames to both canvases, own the paint loop |
| `worker/sim.worker.ts` | IO shell: the only place a wall clock is read; turns elapsed time into a whole number of ticks |
| `worker/client.ts` | Main-thread side of the protocol: spawn, transfer, recycle, heartbeat, restart |
| `state/store.ts` | View model: measured values in, operator intent out. Owns no engine |
| `render/canvas.ts` | Canvas 2D renderer on the main thread; interpolates two frames and paints in world metres |
| `ui/app.ts` | View composition, control wiring |
| `ui/dom.ts` | `textContent`-only element construction — no `innerHTML`, no inline `style=` |
| `ui/judge/tour.ts` | Guided tour with `prefers-reduced-motion` handling |
| `render/palette.ts` | Design tokens read from CSS custom properties |
| `i18n/strings.ts` | All user-facing copy, including ARIA labels |
| `copilot/client.ts` | Fetch wrapper for the edge API, zod validation at the boundary |

### Thread boundary

The simulation runs in a dedicated Worker. The main thread never advances a tick, and it never reads a vehicle position out of the engine.

```
main thread                                  worker
  AppStore ──command──▶ SimulationClient ──postMessage──▶ sim.worker.ts
                                                             │
                                                      TwinWorld.tick()
                                                             │
  renderers ◀──frame (transfer)── ◀──────────── packFrame() ┘
       └──────────── recycle (transfer back) ──────────────▶
```

- **Commands** are zod-validated on arrival against `core/worker/protocol.ts`, so a malformed or stale message is rejected and counted rather than half-applied. The worker treats what it receives as untrusted input rather than trusting the shape of a value the main thread constructed.
- **Frames** are one `Float32Array` of stride 6 — `[x, y, headingRad, lengthM, typeIdx, flags]` — plus one `Uint8Array` of signal heads and a small JSON header (`n`, `tSimS`, `tick`, `tickDtS`). Both buffers are transferred out, transferred back, and reused from a four-buffer pool. A frame that finds the pool empty is dropped and counted; it is never queued behind a newer one.
- **The wall clock decides only how many ticks run.** `performance.now()` gives an elapsed time, which becomes a whole number of `SIM_DT_S` ticks, capped per frame. No simulated quantity is derived from wall time, so a slow machine renders fewer frames of the same simulation rather than a different simulation.
- **Heartbeat.** Two seconds without a frame terminates the worker and replays the input log to the last known time. The operator sees a notice saying exactly that.

Interpolation happens on the main thread between the last two frames: rendering is smooth at display rate while physics stays at a fixed step. Position updates use `element.style.setProperty` for transforms; colour, spacing and type come from tokens.

## 8. Pipeline

| Path | Role |
|---|---|
| `pipeline/docker-compose.yml` | Kafka in KRaft mode (no ZooKeeper) |
| `pipeline/spark/urbanflow_stream.py` | Structured Streaming job: ingest → validate → windowed aggregates → Parquet |
| `pipeline/sql/01_windowed_lane_health.sql` | Windowed per-lane health view |
| `pipeline/sql/02_anomalies_summary.sql` | Anomaly roll-up |
| `pipeline/lite/urbanflow_lite.ts` | Same aggregates in TypeScript for machines without a JVM |

The lite mode exists so a judge can run the data story with `node` and no Docker. It produces the same schema, not the same performance characteristics; the latency claims in [RESULTS.md](RESULTS.md) are only about the control loop, which does not traverse the pipeline at all.

## 9. Why These Boundaries

Recorded as ADRs rather than prose: [docs/adr/](adr/). The load-bearing ones:

- `0001-pure-deterministic-core.md` — why `core` may not touch a clock or a DOM
- `0003-single-writer-safety-kernel.md` — why only the kernel writes signal state
- `0004-coarse-four-phase-conflict-model.md` — what "no conflict" means here
- `0014-seeded-prng-independent-streams.md` — why per-lane streams
- `0017-pnpm-workspaces-single-verify.md` — why one `verify` command

## 10. Pinned Versions

Module 57 §6.5 requires the exact resolved versions and the date they were recorded. Every value below was read from a committed file — the lockfile, `package.json`, `requirements.txt`, `pipeline/.python-version`, `Dockerfile` and `docker-compose.yml` — not from memory or a fresh install (none was run, so these are as-committed, not re-resolved).

| Component | Version | Where pinned |
|---|---|---|
| Node.js | 20 | `.nvmrc` (CI uses `node-version-file`) |
| pnpm | lockfile format `9.0` only — exact tool patch not recorded | `pnpm-lock.yaml` `lockfileVersion`; no `packageManager` pin (see LIMITATIONS item 27) |
| TypeScript | 5.9.3 | resolved in `pnpm-lock.yaml` (declared `^5.6.3`) |
| Vite | 5.4.21 | resolved in `pnpm-lock.yaml` |
| Vitest | 2.1.9 | resolved in `pnpm-lock.yaml` (declared `^2.1.4`) |
| Zod | 3.25.76 | resolved in `pnpm-lock.yaml` (`z.toJSONSchema` needs ≥ 3.25) |
| `@types/node` | 26.6.6 | resolved in `pnpm-lock.yaml` |
| Python | 3.11.9 | `pipeline/.python-version` + Dockerfile base |
| PySpark | 3.5.2 | `pipeline/docker/spark/requirements.txt` |
| pyarrow | 16.1.0 | `pipeline/docker/spark/requirements.txt` |
| Apache Kafka (KRaft image) | apache/kafka:3.8.0 | `pipeline/docker-compose.yml` |
| Spark Kafka connector | 3.5.2 (matches Spark) | `Dockerfile` `SPARK_EXTRA_JARS` jar names |
| MinIO (opt-in `s3` profile) | RELEASE.2025-04-22T22-12-26Z | `pipeline/docker-compose.yml` |
| Hadoop/HDFS (opt-in `hdfs` profile) | apache/hadoop:3.4.1 | `pipeline/docker-compose.yml` |

Build-critical tools are pinned exactly through the committed lockfile (§6.1/§6.2); `^` ranges in `package.json` are resolved deterministically by `pnpm install --frozen-lockfile` in CI. Playwright, ESLint/Prettier, size-limit and dependency-cruiser are deliberately **not** installed — those architecture guarantees run through `scripts/fitness.mjs` and `tsc -b` (see [LIMITATIONS.md](LIMITATIONS.md) item 27, Rule 18). No dependency bumps are made after the feature freeze except security fixes (§6.3).

_Last verified: 2026-10-31 (as-committed; not re-resolved by an install in this pass)._
