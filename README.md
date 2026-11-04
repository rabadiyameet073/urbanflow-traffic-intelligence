# UrbanFlow AI

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?style=for-the-badge&logo=typescript)
![Node](https://img.shields.io/badge/Node.js-v24-green?style=for-the-badge&logo=nodedotjs)
![Architecture Gates](https://img.shields.io/badge/Architecture_Gates-7%2F7_PASS-brightgreen?style=for-the-badge)
![Tests](https://img.shields.io/badge/Tests-125_Passing-success?style=for-the-badge)
![MongoDB](https://img.shields.io/badge/Database-MongoDB_Time--Series-4DB33D?style=for-the-badge&logo=mongodb)
![Licence](https://img.shields.io/badge/Licence-MIT-orange?style=for-the-badge)

### Adaptive traffic-signal intelligence with a formal safety kernel, emergency-vehicle preemption, and an advisory-only Meta AI copilot.

[Live Demo Target](https://urbanflow-ai.pages.dev) • [Presentation Deck (13 Slides)](docs/presentation/BIGDATA_PRESENTATION.md) • [PowerPoint (.pptx)](docs/presentation/UrbanFlow_BigData_Presentation.pptx) • [Distributed & Security Guide](./docs/design/DISTRIBUTED_AND_SECURITY_GUIDE.md) • [Demo Script](./docs/hackathon/DEMO_SCRIPT.md)

</div>

> **Simulation only.** UrbanFlow AI is a research simulator and decision-support prototype. It is not connected to physical signal cabinets, is not certified for any safety function, and makes no claim about real-world deployment. See [docs/validation/LIMITATIONS.md](./docs/validation/LIMITATIONS.md).

---

## Table of Contents
1. [System Architecture Overview](#system-architecture-overview)
2. [Honest Headline Results](#honest-headline-results)
3. [Zero-Trust Cyber Security & Physical Safety Architecture](#zero-trust-cyber-security--physical-safety-architecture)
4. [Distributed & Parallel Processing Architecture](#distributed--parallel-processing-architecture)
5. [Database & Operational Time-Series Store (MongoDB)](#database--operational-time-series-store-mongodb)
6. [Advisory Meta AI Copilot & Semantic Provenance Guard](#advisory-meta-ai-copilot--semantic-provenance-guard)
7. [Quickstart & Terminal Verification](#quickstart--terminal-verification)
8. [Project Deliverables & Repository Map](#project-deliverables--repository-map)
9. [Documentation Directory](#documentation-directory)
10. [Hackathon Rubric Mapping](#hackathon-rubric-mapping)

---

## System Architecture Overview

UrbanFlow is engineered around a **strict boundary**: AI models, heuristics, and emergency preemption managers emit **advisory requests only**. Only the deterministic **Safety Kernel** can write physical `SignalState`, and it strictly enforces six non-negotiable safety invariants.

```
                           [ Edge Gateway (Cloudflare Workers / Node) ]
                                 │                   │
               HMAC-SHA256 Auth  │                   │ Advisory Only
               & Replay Filter   ▼                   ▼
                     [ Preemption Request ]    [ Meta AI Advisory Copilot ]
                                 │             (Muse Spark → Llama → Template)
                                 │                   │
                                 ▼                   ▼ (Diagnostics & Explanations)
             ┌──────────────────────────────────────────────────────────┐
             │            Single-Writer Deterministic Safety Kernel      │
             │     ├── Min Green 7.0s     ├── Mandatory Yellow 3.5s    │
             │     ├── All-Red 2.0s       ├── Anti-Starvation 120s     │
             │     └── Formal Conflict Invariants (I1–I6)              │
             └──────────────────────────┬───────────────────────────────┘
                                        │ Authoritative SignalState
                                        ▼
             ┌──────────────────────────────────────────────────────────┐
             │       Dedicated Web Worker Thread (sim.worker.ts)        │
             │  ├── Baseline Fixed Twin     ├── Real-Time Adaptive Twin │
             │  └── 8-Lane Partitioned PRNG Streams (Mulberry32)        │
             └──────────────────────────┬───────────────────────────────┘
                                        │ Transferable Float32Array (Zero-Copy)
                                        ▼
             ┌──────────────────────────────────────────────────────────┐
             │       UI Main Thread (packages/web) — 60 FPS Canvas      │
             │  ├── Microscopic 2D Canvas  ├── Live KPI Delta Stream   │
             │  └── Real-Time Operator Lab └── Sub-ms MongoDB Sink     │
             └──────────────────────────────────────────────────────────┘
```

---

## Honest Headline Results

Measured by `pnpm bench` on **5 held-out seeds (1001–1005)**, paired fixed-time vs adaptive, 600 s per run, 95 % bootstrap CI over per-seed relative differences. Positive = Adaptive produced less person-delay. Full ledger, method and caveats: [docs/validation/RESULTS.md](./docs/validation/RESULTS.md).

| Scenario | Fixed | Adaptive | Δ | 95 % CI | CI excludes 0 |
|---|---|---|---|---|---|
| Balanced Parity | 98.50 s | 79.38 s | +18.9 % | [−1.5, +39.2] | no |
| Balanced High Traffic | 128.60 s | 117.05 s | +9.0 % | [+0.4, +17.7] | **yes** |
| Near Saturation | 141.13 s | 145.55 s | −4.8 % | [−19.9, +8.8] | no |
| Light Night Traffic | 59.14 s | 40.07 s | +24.8 % | [+4.2, +48.9] | **yes** |
| North–South Heavy Tide | 106.70 s | 80.28 s | +24.8 % | [+18.0, +31.6] | **yes** |
| Stadium Surge Dump | 86.69 s | 92.70 s | −12.3 % | [−36.7, +7.2] | no |
| Mixed Uneven | 101.24 s | 91.21 s | +9.0 % | [−2.3, +20.3] | no |
| Blocked Lane Incident | 107.43 s | 84.10 s | +20.7 % | [+2.0, +39.3] | **yes** |

**What the data supports:** Adaptive is never *significantly* worse than fixed-time, and is significantly better in 4 of 8 scenarios. Two scenarios (Near Saturation, Stadium Surge Dump) have point estimates that favour fixed-time; in both cases the interval includes zero. Adaptive discharged more vehicles in 8 of 8 scenarios and denied fewer entries in 6 of 8. Safety-kernel conflicts: **0**. Conservation (`arrivals = exited + inSystem + denied`): **true** in every run of both controllers.

**What it does not support:** a headline percentage. With five seeds, four scenarios are unresolved. Every number above is written by the benchmark into [`packages/bench/out/results.json`](packages/bench/out/results.json); `pnpm docs:check` fails the build if this table drifts from that file.

### Operational Metric: Vehicle Denial at Approach

Person-delay only reflects vehicles that completed their transit. Under heavy saturation, turning away vehicles artificially improves delay scores. UrbanFlow measures raw **denied entries at the approach boundary**:

| Scenario | Fixed-Time Denial | Adaptive Denial | Operational Impact |
|---|---|---|---|
| **Near Saturation** | 43.94 % | **29.43 %** | 14.5 % more total vehicles served |
| **Balanced Parity** | 11.64 % | **0.05 %** | Near-zero approach rejection |
| **Blocked Lane Incident** | 14.66 % | **0.77 %** | Approach denial nearly eliminated during incident response |

---

## Zero-Trust Cyber Security & Physical Safety Architecture

Traffic signals represent critical urban infrastructure. UrbanFlow treats every inbound network communication as untrusted, enforcing a **6-Barrier Defense-in-Depth Model**:

```
[ Inbound Preemption Request ]
       │
       ▼
[ Barrier 1: Timestamp Skew Window ] ──────► Rejects requests older than ±30s (anti-stale)
       │
       ▼
[ Barrier 2: Constant-Time HMAC-SHA256 ] ──► crypto.subtle.verify eliminates timing attacks
       │
       ▼
[ Barrier 3: Single-Use Nonce Store ] ────► seenNonces set rejects replayed radio packets
       │
       ▼
[ Barrier 4: Storm Guard Rate Limiter ] ──► >20 req/10s triggers automated 30s junction lockout
       │
       ▼
[ Barrier 5: Single-Writer Safety Kernel ] ─► Enforces Invariants I1–I6 (Min green, yellow, all-red)
       │
       ▼
[ Barrier 6: Hardware Watchdog ] ─────────► Heartbeat timeout commands autonomous FLASH_RED
       │
       ▼
[ Physical Signal Heads ]
```

### Safety Kernel Invariants (Enforced in Code)
- **Minimum Green Invariant (`I1`):** Clamped to $\ge 7.0\,\text{s}$ (`TIMING.G_MIN_S`) to prevent driver-disorienting signal flickering.
- **Mandatory Yellow Clearance (`I2`):** Strictly clamped to $3.5\,\text{s}$ (`TIMING.YELLOW_S`).
- **Mandatory All-Red Clearance (`I3`):** Strictly clamped to $2.0\,\text{s}$ (`TIMING.ALL_RED_S`) to purge intersection box before conflicting phases turn green.
- **Anti-Starvation Clamp (`I4`):** If red wait time on any phase reaches $120.0\,\text{s}$ (`TIMING.MAX_RED_WAIT_S`), green is forcibly yielded to that starved approach.
- **Formal Conflict Proof (`I5`):** `assertInvariants(nextState)` mathematically guarantees zero simultaneous conflicting non-red states.
- **Fail-Safe Fallback (`I6`):** Hardware watchdog isolation command transitions directly to `FLASH_RED`, with recovery gated through mandatory `ALL_RED`.

*Code References:* [kernel.ts](packages/core/src/control/kernel.ts) • [hmac.ts](packages/core/src/helpers/hmac.ts) • [evp.ts](packages/core/src/control/evp.ts) • [watchdog.ts](packages/core/src/control/watchdog.ts) • [Detailed Guide](./docs/design/DISTRIBUTED_AND_SECURITY_GUIDE.md)

---

## Distributed & Parallel Processing Architecture

Instead of streaming 2,400 raw sensor records/second over public cloud networks (which introduces 50–150ms latency, jitter, and egress costs), UrbanFlow processes telemetry **locally across dedicated worker threads and partitioned in-memory streams**:

1. **Local Web Worker Thread Isolation (`sim.worker.ts`):**
   - The entire microscopic simulation and controller logic execute on a dedicated background Web Worker thread, completely decoupled from the UI main thread.
   - Utilizes **transferable zero-copy memory buffers** (`Float32Array`, `Uint8Array`) via `postMessage(..., [vehicles.buffer, heads.buffer])`, guaranteeing 60 FPS rendering without UI frame drops.
2. **Dual-Twin Parallel Orchestration (`twin.ts`):**
   - Advances both the baseline fixed-time intersection (`simFixed`) and the adaptive intersection (`simAdaptive`) simultaneously under identical pseudo-random vehicle arrival seeds.
3. **8-Lane In-Memory Partitions (`engine.ts`):**
   - Partitions traffic across all 8 approaches (`NB-TR`, `NB-L`, `SB-TR`, `SB-L`, `EB-TR`, `EB-L`, `WB-TR`, `WB-L`) with independent PRNG streams (`splitRng(seed, 'arrivals:${lane}')`) and ring buffers, preventing thread contention.
4. **Local Multi-Lane Window Aggregator (`urbanflow_lite.ts`):**
   - Maintains concurrent sliding 10-second window aggregations and online EWMA variance tracking right at the edge without requiring external streaming clusters.

---

## Database & Operational Time-Series Store (MongoDB)

UrbanFlow utilizes **MongoDB** via [`@urbanflow/db`](db/) as its operational time-series lake:

```
[ Local Worker Partitions ] ──► [ Idempotent BSON Sink ] ──► [ MongoDB (WiredTiger) ]
                                _id = run_id | lane | window        ├── lane_metrics
                                                                    ├── anomalies
                                                                    └── evp_audit
```

### Why NoSQL for Real-Time Traffic Systems?
- **Lock-Free Ingestion:** Relational SQL engines rely on table/row-level ACID locks that stall under high sensor ingestion frequencies. MongoDB's WiredTiger storage engine provides document-level concurrency and lock-free writes.
- **Deterministic Idempotent Keys:** Records use compound keys `_id = run_id | lane | window_start_ms`, guaranteeing zero duplicate records during replay sweeps.
- **Fast Local Queries:** against the seeded development dataset, queries resolve in well under a millisecond, so the audit trail does not block the timing loop. No production latency figures are claimed (see [docs/validation/LIMITATIONS.md](./docs/validation/LIMITATIONS.md)).

---

## Advisory Meta AI Copilot & Semantic Provenance Guard

UrbanFlow integrates Meta AI models for incident diagnosis and conversational operational assistance, backed by strict architectural constraints:

```
[ Operator Inquiry / Incident Detected ]
                   │
                   ▼
  [ Provider Fallback Chain ]
  ├── 1. Primary: Meta Muse Spark (Meta Model API)
  ├── 2. Fallback: Llama 3.1 70B (Serverless Inference)
  └── 3. Offline: Deterministic Template Engine
                   │
                   ▼
  [ Zod Schema & Semantic Provenance Gate ] ──► verifySemanticNumbers(evidence[], rawInput)
                   │
         ┌─────────┴─────────┐
      PASS                 FAIL (Hallucinated metric)
         │                   │
         ▼                   ▼
  [ Advisory Diagnosis ]   [ Fallback to Deterministic Template ]
```

### The Provenance Check (`verifySemanticNumbers`)
Located in [`packages/edge/src/copilot/schemas.ts`](packages/edge/src/copilot/schemas.ts#L44-L50), this semantic verifier parses every numeric token cited in the model's hypothesis and proves it was present in the raw input telemetry. If the model hallucinates numbers, the response is discarded and safely substituted with deterministic analysis.

---

## Quickstart & Terminal Verification

### Prerequisites
- Node.js `^20.18.0` or `^24.0.0`
- pnpm `^9.0.0`
- MongoDB local instance running on `localhost:27017` (optional, falls back gracefully)

### Installation & Launch
```bash
# Clone the repository
git clone https://github.com/rabadiyameet073/urbanflow-traffic-intelligence.git
cd urbanflow-traffic-intelligence

# Install dependencies
pnpm install

# Start development servers (Web UI on 5173, Edge Gateway on 8787)
pnpm dev:web
pnpm dev:edge
```
- Open **`http://localhost:5173/`** to view the interactive twin intersection.
- Check Edge Gateway health: **`http://localhost:8787/api/health`**.

---

### Terminal Verification Commands (For Demo & Auditing)

```bash
# 1. Verify 7 automated architecture fitness gates (purity, cycles, zero secret leakage)
node scripts/fitness.mjs

# 2. Run Cyber Security & Fuzz Attack Test Suite (HMAC auth, replay defense, 1000 fuzz strings)
npx vitest run packages/core/test/system_design.test.ts packages/edge/test/edge.test.ts

# 3. Run entire unit & property test suite (125 tests; 8 regression tests run via `pnpm test:regression`)
pnpm test

# 4. Verify documentation consistency against benchmark JSON artefacts
pnpm docs:check

# 5. Typecheck monorepo
pnpm typecheck
```

---

## Project Deliverables & Repository Map

```
├── packages/
│   ├── core/                          # Deterministic simulation engine & safety kernel
│   │   ├── src/control/kernel.ts      # Authoritative single-writer safety kernel (I1–I6)
│   │   ├── src/control/evp.ts         # Preemption manager with Storm Guard rate-limiting
│   │   ├── src/control/watchdog.ts    # Hardware heartbeat watchdog (FLASH_RED fail-safe)
│   │   ├── src/helpers/hmac.ts        # Constant-time Web Crypto HMAC-SHA256 verification
│   │   └── src/sim/engine.ts          # Microscopic simulation with 8 independent PRNG streams
│   ├── edge/                          # Cloudflare Edge Gateway Worker
│   │   ├── src/security/index.ts      # Edge signature & timestamp skew gateway
│   │   ├── src/do/Room.ts             # Cloudflare Durable Object distributed state sync
│   │   └── src/copilot/               # Meta AI advisory provider chain & provenance checks
│   ├── web/                           # Operator dashboard & rendering
│   │   ├── src/render/canvas.ts       # 60 FPS Canvas 2D engine with 14m road markings
│   │   └── src/worker/sim.worker.ts   # Web Worker thread with transferable ArrayBuffers
│   └── bench/                         # Paired-seed statistical benchmarking suite
├── db/                                # Shared @urbanflow/db package (MongoDB operational sink)
├── pipeline/                          # Local streaming engine (urbanflow_lite.ts) & Kafka configs
├── evals/                             # LLM evaluation harness (replay, live, floors)
├── scripts/                           # Build, docs-check, fitness and dev helper scripts
├── docs/                              # Everything a reviewer needs, by topic
│   ├── design/                        # ARCHITECTURE, API contract, data dictionary, distributed & security guide
│   ├── validation/                    # SAFETY_CASE, RESULTS, TEST_REPORT, LIMITATIONS, ACCESSIBILITY, AUDIT_LOG
│   ├── hackathon/                     # DEMO_SCRIPT, SUBMISSION_FIELDS, CREDITS, META_API_NOTES
│   ├── adr/                           # 21 Architecture Decision Records (ADR 0001–0021)
│   ├── runbooks/                      # Deploy guide + 7 operational runbooks
│   ├── presentation/                  # Big Data deck, .pptx, and generate_pptx.py
│   ├── assets/                        # architecture.png, junction.png
│   ├── muse-prompts/                  # Meta AI (Muse) prompt versions used in the copilot
│   ├── reference/                     # Source briefs, playbook & hackathon details (provenance)
│   └── specs/instruction/             # Engineering specification pack (modules 01–64)
```

---

## Documentation Directory

| Specification Document | Focus Area |
|---|---|
| [docs/validation/SAFETY_CASE.md](./docs/validation/SAFETY_CASE.md) | Invariant proofs, safety claims, and empirical verification |
| [docs/design/DISTRIBUTED_AND_SECURITY_GUIDE.md](./docs/design/DISTRIBUTED_AND_SECURITY_GUIDE.md) | File-by-file code guide with direct line numbers |
| [docs/validation/RESULTS.md](./docs/validation/RESULTS.md) | Complete benchmark ledger, paired seeds, and bootstrap CIs |
| [docs/hackathon/DEMO_SCRIPT.md](./docs/hackathon/DEMO_SCRIPT.md) | 3-minute video presentation script with timestamps |
| [docs/design/ARCHITECTURE.md](./docs/design/ARCHITECTURE.md) | System components, data flows, and determinism guarantees |
| [docs/validation/LIMITATIONS.md](./docs/validation/LIMITATIONS.md) | Clear boundaries of the simulation and unverified domains |
| [docs/validation/TEST_REPORT.md](./docs/validation/TEST_REPORT.md) | Master audit of all test suites and pass criteria |
| [SECURITY.md](SECURITY.md) | Vulnerability disclosure policy and threat model |

---

## Hackathon Rubric Mapping

| Criterion | Implementation & Evidence |
|---|---|
| **Technical Depth** | Bit-deterministic microscopic simulation; single-writer safety kernel; Durable Objects replay store; transferable zero-copy memory buffers; constant-time HMAC-SHA256 authentication. |
| **Use of Meta AI** | Advisory incident diagnosis via Muse Spark and Llama; `verifySemanticNumbers` provenance gate protecting against hallucinations; SAM 3.1 visual attention masks. |
| **Safety & Correctness** | Formally defined Invariants I1–I6 in [docs/validation/SAFETY_CASE.md](./docs/validation/SAFETY_CASE.md); 125 automated tests (plus 8 regression tests); zero kernel conflicts across all benchmark runs. |
| **Honest Measurement** | Paired-seed benchmarking across 5 held-out seeds with 95% bootstrap confidence intervals; full reporting of parity and losses; automated `pnpm docs:check` drift detection. |
| **Craft & Polish** | 21 Architecture Decision Records (ADRs); 7 operational runbooks; WCAG 2.2 AA accessible operator interface; 7 automated fitness gates passing. |

---

## Licence

MIT — see [LICENSE](LICENSE). All third-party assets and models are credited in [docs/hackathon/CREDITS.md](./docs/hackathon/CREDITS.md).
