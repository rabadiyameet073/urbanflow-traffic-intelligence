# UrbanFlow: Distributed Processing & Cyber Security Architecture Guide
> Click any link below to open the exact file and line directly in your editor.

---

## Table of Contents
1. [Distributed & Parallel Processing Architecture](#1-distributed--parallel-processing-architecture)
   - [Local Web Worker Thread Isolation](#11-local-web-worker-thread-isolation)
   - [Dual-Twin Parallel Orchestration](#12-dual-twin-parallel-orchestration)
   - [8-Lane In-Memory Partitions & Independent Streams](#13-8-lane-in-memory-partitions--independent-streams)
   - [Local Multi-Lane Window Aggregator](#14-local-multi-lane-window-aggregator)
   - [Distributed State Synchronization (Durable Objects)](#15-distributed-state-synchronization-durable-objects)
2. [Cyber Security & Physical Safety Architecture](#2-cyber-security--physical-safety-architecture)
   - [HMAC-SHA256 Cryptographic Verification](#21-hmac-sha256-cryptographic-verification)
   - [Anti-Replay Nonce Store & Storm Guard Rate Limiter](#22-anti-replay-nonce-store--storm-guard-rate-limiter)
   - [Single-Writer Deterministic Safety Kernel](#23-single-writer-deterministic-safety-kernel)
   - [Autonomous Hardware Watchdog & Fail-Safe Fallback](#24-autonomous-hardware-watchdog--fail-safe-fallback)
3. [One-Click Summary Table of Core Code](#3-one-click-summary-table-of-core-code)
4. [Related Architecture Specifications (ADRs), Safety Cases & Tests](#4-related-architecture-specifications-adrs-safety-cases--tests)

---

## 1. Distributed & Parallel Processing Architecture

UrbanFlow achieves real-time speed by processing telemetry **locally across concurrent threads and independent partitions**, completely eliminating external network streaming bottlenecks.

---

### 1.1 Local Web Worker Thread Isolation
* **Source File:** [packages/web/src/worker/sim.worker.ts](../packages/web/src/worker/sim.worker.ts#L1)
* **What it does:** Executes both digital twin simulations, kinematics updates, and signal control logic on a **dedicated background Web Worker thread**. The browser UI main thread only handles user events and canvas drawing.
* **Direct Code Links:**
  - 🔗 [Transferable Zero-Copy Buffers (Lines 173–195)](../packages/web/src/worker/sim.worker.ts#L173) — Uses `post(event, [vehicles.buffer, heads.buffer])` to transfer ownership of typed arrays without serialization overhead.
  - 🔗 [Fixed-Time Step Metering (Lines 200–225)](../packages/web/src/worker/sim.worker.ts#L200) — Uses an accumulator to advance physics in exact 0.1s discrete steps, preventing simulation drift under heavy loads.
  - 🔗 [Command Dispatcher (Lines 228–320)](../packages/web/src/worker/sim.worker.ts#L228) — Receives asynchronous operator commands (`spawnVehicle`, `setLaneDemand`, `requestPreemption`).

---

### 1.2 Dual-Twin Parallel Orchestration
* **Source File:** [packages/core/src/worker/twin.ts](../packages/core/src/worker/twin.ts#L130)
* **Class:** `TwinWorld`
* **What it does:** Instantiates and advances the baseline fixed-time intersection (`simFixed`) and the adaptive intersection (`simAdaptive`) in lockstep under identical vehicle arrivals.
* **Direct Code Links:**
  - 🔗 [Parallel Tick Stepping (Lines 157–196)](../packages/core/src/worker/twin.ts#L157) — Calls `ctrlFixed.decide()` and `ctrlAdaptive.decide()`, runs emergency preemption logic, and steps both engines in parallel.
  - 🔗 [Memory Frame Packing (Lines 615–645)](../packages/core/src/worker/twin.ts#L615) — Directly packs vehicle coordinates ($x, y$, heading, velocity, flags) and signal head states into `Float32Array` buffers for the renderer.

---

### 1.3 8-Lane In-Memory Partitions & Independent Streams
* **Source File:** [packages/core/src/sim/engine.ts](../packages/core/src/sim/engine.ts#L126)
* **Class:** `SimEngine`
* **What it does:** Splits the intersection into 8 completely independent approach lanes (`NB-TR`, `NB-L`, `SB-TR`, `SB-L`, `EB-TR`, `EB-L`, `WB-TR`, `WB-L`).
* **Direct Code Links:**
  - 🔗 [Independent PRNG Streams (Lines 126–132)](../packages/core/src/sim/engine.ts#L126) — Generates isolated pseudo-random number generator streams per lane (`splitRng(seed, 'arrivals:${lane}')`), guaranteeing deterministic vehicle generation without shared state contamination.
  - 🔗 [Local Ring Buffers (Lines 811–818)](../packages/core/src/sim/engine.ts#L811) — Uses in-memory circular ring buffers (`arrivalRing`, `dischargeRing`) to record rolling 10-second traffic volume in $O(1)$ time.
  - 🔗 [Lane State Observation (Lines 790–848)](../packages/core/src/sim/engine.ts#L790) — Computes vehicle count, queue length in metres, max wait times, and emergency vehicle detection per lane.

---

### 1.4 Local Multi-Lane Window Aggregator
* **Source File:** [pipeline/lite/urbanflow_lite.ts](../pipeline/lite/urbanflow_lite.ts#L41)
* **Class:** `UrbanFlowLiteProcessor`
* **What it does:** A lightweight, local stream processor that maintains concurrent sliding window buffers across all 8 lanes without requiring external streaming servers.
* **Direct Code Links:**
  - 🔗 [Online EWMA Variance Tracking (Lines 27–40)](../pipeline/lite/urbanflow_lite.ts#L27) — Computes online Exponentially Weighted Moving Average (EWMA) and Z-score statistics in real time.
  - 🔗 [Concurrent Buffer Draining (Lines 59–90)](../pipeline/lite/urbanflow_lite.ts#L59) — Aggregates 10-second window metrics and detects anomalous traffic bottlenecks.

---

### 1.5 Distributed State Synchronization (Durable Objects)
* **Source File:** [packages/edge/src/do/Room.ts](../packages/edge/src/do/Room.ts#L1)
* **Class:** `Room`
* **What it does:** Coordinates strongly-consistent junction state across connected operator consoles, vehicle beacons, and digital twins using Cloudflare Durable Objects.
* **Direct Code Link:** 🔗 [Durable Object Room Implementation (Lines 1–80)](../packages/edge/src/do/Room.ts#L1)

---

## 2. Cyber Security & Physical Safety Architecture

---

### 2.1 HMAC-SHA256 Cryptographic Verification
* **Core Crypto Helper:** [packages/core/src/helpers/hmac.ts](../packages/core/src/helpers/hmac.ts#L23)
* **Edge Verification Gateway:** [packages/edge/src/security/index.ts](../packages/edge/src/security/index.ts#L52)
* **What it does:** Validates that emergency vehicle preemption requests carry authentic digital signatures generated with pre-shared cryptographic keys, preventing rogue radio beacons from hijacking green lights.
* **Direct Code Links:**
  - 🔗 [Constant-Time Verification: verifyHex (Lines 30–35)](../packages/core/src/helpers/hmac.ts#L30) — Uses `crypto.subtle.verify('HMAC', key, sig, msg)` to compare signatures in constant time, eliminating timing side-channel attacks.
  - 🔗 [Timestamp Skew Window: withinWindow (Lines 38–40)](../packages/core/src/helpers/hmac.ts#L38) — `withinWindow(tsMs, nowMs, 30_000)` ensures expired requests are rejected.
  - 🔗 [Signature Enforcement Gateway (Lines 52–65)](../packages/edge/src/security/index.ts#L52) — Validates the `SignedEvp` payload structure before any directive reaches the simulator.

---

### 2.2 Anti-Replay Nonce Store & Storm Guard Rate Limiter
* **Source File:** [packages/core/src/control/evp.ts](../packages/core/src/control/evp.ts#L145)
* **Class:** `EvpManager`
* **What it does:** Protects the junction against replay attacks (recording a valid ambulance radio beacon and playing it back later) and Denial-of-Service (DoS) flooding.
* **Direct Code Links:**
  - 🔗 [Storm Guard Flooding Defense (Lines 147–160)](../packages/core/src/control/evp.ts#L147) — Maintains a rolling 10-second request history (`requestHistory10s`). If more than 20 requests arrive in 10 seconds, the junction locks down preemption for 30 seconds (`STORM_GUARD`).
  - 🔗 [Single-Use Nonce Store (Lines 168–170)](../packages/core/src/control/evp.ts#L168) — `if (this.seenNonces.has(req.nonce)) return this.reject(req.id, 'NONCE_REPLAY')`.
  - 🔗 [Per-Source Rate Limiting (Lines 173–176)](../packages/core/src/control/evp.ts#L173) — Restricts sources to $\le 1\,\text{request} / 10\,\text{s}$.
  - 🔗 [Physical Plausibility Bounds (Lines 178–184)](../packages/core/src/control/evp.ts#L178) — Rejects impossible kinematics (speed outside $[3, 35]\,\text{m/s}$ or distance outside $[20, 800]\,\text{m}$).

---

### 2.3 Single-Writer Deterministic Safety Kernel
* **Source File:** [packages/core/src/control/kernel.ts](../packages/core/src/control/kernel.ts#L120)
* **Class:** `SafetyKernel`
* **What it does:** The **sole writer** of `SignalState` in the entire codebase. Neither AI models, adaptive controllers, nor emergency overrides can write signal states directly; they can only submit requests.
* **Direct Code Links:**
  - 🔗 [Minimum Green Invariant (Lines 175–179)](../packages/core/src/control/kernel.ts#L175) — Clamps all phase changes to ensure green runs for at least $7.0\,\text{s}$ (`TIMING.G_MIN_S`), preventing rapid driver-confusing signal flickering.
  - 🔗 [Mandatory Yellow Clearance Invariant (Lines 211–216)](../packages/core/src/control/kernel.ts#L211) — Enforces exactly $3.5\,\text{s}$ of yellow clearance (`TIMING.YELLOW_S`).
  - 🔗 [Mandatory All-Red Clearance Invariant (Lines 217–233)](../packages/core/src/control/kernel.ts#L217) — Enforces exactly $2.0\,\text{s}$ of all-red clearance (`TIMING.ALL_RED_S`) to clear the intersection box before any conflicting phase turns green.
  - 🔗 [Anti-Starvation Clamp (Lines 155–162)](../packages/core/src/control/kernel.ts#L155) — Tracks red wait time per phase; if any phase waits $\ge 120\,\text{s}$ (`TIMING.MAX_RED_WAIT_S`), green is forcibly yielded to that starved approach.
  - 🔗 [Formal Conflict Checker I1–I6 (Lines 286–318)](../packages/core/src/control/kernel.ts#L286) — `assertInvariants(nextState)` checks on **every single output state** that no two conflicting approaches ever display non-red signals simultaneously.

---

### 2.4 Autonomous Hardware Watchdog & Fail-Safe Fallback
* **Hardware Watchdog File:** [packages/core/src/control/watchdog.ts](../packages/core/src/control/watchdog.ts#L30)
* **Kernel Fail-Safe Hook:** [packages/core/src/control/kernel.ts](../packages/core/src/control/kernel.ts#L100)
* **What it does:** Constantly checks the controller's software heartbeat. If an adaptive algorithm freezes, crashes, or drops offline, the watchdog immediately isolates the controller and commands the signal into an autonomous fail-safe state.
* **Direct Code Links:**
  - 🔗 [Fail-Safe Trigger (Lines 100–105)](../packages/core/src/control/kernel.ts#L100) — `failSafe()` switches all signals into `FLASH_RED`.
  - 🔗 [Safe Recovery through All-Red (Lines 107–118)](../packages/core/src/control/kernel.ts#L107) — `recover()` enforces that exiting `FLASH_RED` **must pass through an `ALL_RED` buffer** before returning to baseline fixed timing.
  - 🔗 [Hardware Watchdog Loop (Lines 30–75)](../packages/core/src/control/watchdog.ts#L30) — Heartbeat timeout tracking and automated fault escalation.

---

## 3. One-Click Summary Table of Core Code

Click any link in the table to jump directly into the code:

| Component | Direct File Link | Exact Line Range | Key Responsibility |
|---|---|---|---|
| **Local Web Worker** | [packages/web/src/worker/sim.worker.ts](../packages/web/src/worker/sim.worker.ts#L173) | Lines 173–195 | Background simulation thread + zero-copy buffer transfer |
| **Dual Twin Orchestrator** | [packages/core/src/worker/twin.ts](../packages/core/src/worker/twin.ts#L157) | Lines 157–196 | Stepping fixed and adaptive twins in parallel lockstep |
| **8-Lane Partitioned Engine** | [packages/core/src/sim/engine.ts](../packages/core/src/sim/engine.ts#L126) | Lines 126–132 | Isolated per-lane PRNG streams and queue ring buffers |
| **Local Window Processor** | [pipeline/lite/urbanflow_lite.ts](../pipeline/lite/urbanflow_lite.ts#L41) | Lines 41–90 | Concurrent 10-second sliding windows and online EWMA |
| **HMAC-SHA256 Auth** | [packages/core/src/helpers/hmac.ts](../packages/core/src/helpers/hmac.ts#L30) | Lines 30–35 | Constant-time Web Crypto API signature verification |
| **Edge Security Gateway** | [packages/edge/src/security/index.ts](../packages/edge/src/security/index.ts#L52) | Lines 52–65 | Skew window validation and emergency token authentication |
| **Replay & Storm Defense** | [packages/core/src/control/evp.ts](../packages/core/src/control/evp.ts#L147) | Lines 147–177 | Nonce deduplication and 20 req/10s Storm Guard |
| **Single-Writer Safety Kernel** | [packages/core/src/control/kernel.ts](../packages/core/src/control/kernel.ts#L120) | Lines 120–240 | Authoritative writer of SignalState; mandatory yellow/all-red |
| **Signal Invariant Checker** | [packages/core/src/control/kernel.ts](../packages/core/src/control/kernel.ts#L286) | Lines 286–318 | Mathematical proof of zero conflicting greens (I1–I6) |
| **Hardware Watchdog** | [packages/core/src/control/watchdog.ts](../packages/core/src/control/watchdog.ts#L30) | Lines 30–75 | Heartbeat monitoring and automated `FLASH_RED` fail-safe |
| **MongoDB Operational Sink** | [pipeline/spark/urbanflow/mongo_sink.py](../pipeline/spark/urbanflow/mongo_sink.py#L35) | Lines 35–65 | Deterministic idempotent keying (`_id = run\|lane\|window`) |

---

## 4. Related Architecture Specifications (ADRs), Safety Cases & Tests

### Architecture Decision Records (ADRs)
* 🔗 [ADR 0001: Pure Deterministic Core](adr/0001-pure-deterministic-core.md)
* 🔗 [ADR 0002: Browser Worker & Edge Gateway](adr/0002-browser-worker-signals-edge-gateway.md)
* 🔗 [ADR 0003: Single-Writer Safety Kernel](adr/0003-single-writer-safety-kernel.md)
* 🔗 [ADR 0007: Canvas 2D Worker Transferable Arrays](adr/0007-canvas-2d-worker-transferable-arrays.md)
* 🔗 [ADR 0010: Cloudflare Workers Durable Objects](adr/0010-cloudflare-workers-durable-objects.md)
* 🔗 [ADR 0012: HMAC Signed EVP Gateway](adr/0012-hmac-signed-evp-gateway.md)
* 🔗 [ADR 0014: Seeded PRNG Independent Streams](adr/0014-seeded-prng-independent-streams.md)

### Formal Safety Verification & Test Suites
* 🔗 [Safety Case Report](SAFETY_CASE.md)
* 🔗 [System Design & Security Tests](../packages/core/test/system_design.test.ts)
* 🔗 [Edge Gateway Security Tests](../packages/edge/test/edge.test.ts)
* 🔗 [Core Safety Property Tests](../packages/core/test/core.test.ts)

### Presentation & Project Documentation
* 🔗 [13-Slide Master Presentation Deck](../presentation/BIGDATA_PRESENTATION.md)
* 🔗 [13-Slide PowerPoint File (.pptx)](../presentation/UrbanFlow_BigData_Presentation.pptx)
* 🔗 [Copy-Paste AI Prompts](../presentation/PPT_PROMPTS_AND_GUIDE.md)
* 🔗 [Complete Big Data Project Blueprint](../traffic_signal_bigdata_project.md)
