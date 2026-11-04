# UrbanFlow — Hackathon Presentation Direct Code Links & Architecture Cheat Sheet

> **One-Click Navigation Guide for Meta Global AI Hackathon Video Recording & Evaluation**
> Every item below is a **direct clickable hyperlink** into the exact source code and line range. Click any blue link to jump straight to the implementation on GitHub or locally in your editor.

---

## 1. Distributed & Parallel Processing Architecture

### 1.1 Local Web Worker Isolation (Zero Main-Thread Blocking)
* 🔗 [**Worker Thread Message Dispatch & Zero-Copy Transfers (`sim.worker.ts#L173-L195`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/web/src/worker/sim.worker.ts#L173-L195) · [Local Link](file:///d:/bda%20project/packages/web/src/worker/sim.worker.ts#L173-L195)
  * **What it does:** Runs the entire physics simulation and twin calculations in a dedicated background Web Worker thread, completely decoupled from the UI main thread.
  * **Key Mechanism:** Uses transferable zero-copy memory buffers (`Float32Array`, `Uint8Array`) via `postMessage(event, [vehicles.buffer, heads.buffer])` so the 60 FPS UI never drops a frame even under 100× sim speeds.
* 🔗 [**High-Frequency KPI & Telemetry Publisher (`sim.worker.ts#L96-L125`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/web/src/worker/sim.worker.ts#L96-L125) · [Local Link](file:///d:/bda%20project/packages/web/src/worker/sim.worker.ts#L96-L125)
  * Transmits atomic queue depths, delay metrics, and pressure telemetry to the UI dashboard without allocations.

### 1.2 Dual-Twin Parallel Orchestration (Fixed vs. Adaptive in Lockstep)
* 🔗 [**Synchronous Dual-Twin Execution Loop (`twin.ts#L157-L196`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/worker/twin.ts#L157-L196) · [Local Link](file:///d:/bda%20project/packages/core/src/worker/twin.ts#L157-L196)
  * **What it does:** Advances two parallel digital twin worlds (`simFixed` vs `simAdaptive`) simultaneously under the exact same pseudo-random arrival seeds.
  * **Key Mechanism:** `tick()` advances both controllers concurrently, evaluates observations, and packs transferable frames so the operator can directly compare AI performance against legacy fixed-time control in real time.

### 1.3 Multi-Lane In-Memory Partitions & Independent Streams
* 🔗 [**Isolated Lane Ring Buffers & Partitions (`engine.ts#L65-L95`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/sim/engine.ts#L65-L95) · [Local Link](file:///d:/bda%20project/packages/core/src/sim/engine.ts#L65-L95)
  * **What it does:** Partitions traffic across all 8 approach lanes with independent random streams (`splitRng(seed, 'arrivals:${lane}')`) and individual ring buffers (`arrivalRing`, `dischargeRing`).
  * **Why it matters:** Guarantees parallel lane arrivals without thread interference or shared state contamination.

### 1.4 Local Multi-Lane Streaming Window Processor
* 🔗 [**10-Second Rolling Window & EWMA Variance Tracker (`pipeline/lite/urbanflow_lite.ts#L50-L110`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/pipeline/lite/urbanflow_lite.ts#L50-L110) · [Local Link](file:///d:/bda%20project/pipeline/lite/urbanflow_lite.ts#L50-L110)
  * **What it does:** Implements local 10-second rolling window aggregations and online EWMA variance tracking concurrently across all 8 lanes (`this.windowBuffers.set(lane, [])`).
  * **Why it matters:** Processes all approach lanes locally at the edge without sending raw telemetry over external networks.

### 1.5 Edge State Synchronization (Cloudflare Durable Objects)
* 🔗 [**Distributed Multi-Operator Coordination Room (`Room.ts#L35-L90`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/do/Room.ts#L35-L90) · [Local Link](file:///d:/bda%20project/packages/edge/src/do/Room.ts#L35-L90)
  * **What it does:** Distributed coordination engine managing strongly-consistent state across multi-operator dashboards and V2X vehicle communication streams.

---

## 2. Cyber Security & Safety Kernel Architecture

### 2.1 Cryptographic Verification (HMAC-SHA256 Constant-Time)
* 🔗 [**Constant-Time HMAC-SHA256 Verification (`hmac.ts#L30-L36`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/helpers/hmac.ts#L30-L36) · [Local Link](file:///d:/bda%20project/packages/core/src/helpers/hmac.ts#L30-L36)
  * **What it does:** Uses Web Crypto API (`crypto.subtle.verify`) for constant-time cryptographic verification, completely eliminating timing side-channel attacks.
* 🔗 [**Edge Gateway Inbound Signature Verification (`security/index.ts#L52-L71`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/security/index.ts#L52-L71) · [Local Link](file:///d:/bda%20project/packages/edge/src/security/index.ts#L52-L71)
  * **What it does:** Validates that emergency vehicle beacons possess a valid HMAC signature created with pre-shared vehicle secrets before forwarding to controllers.

### 2.2 Anti-Replay Nonce Store & Storm Guard Rate Limiting
* 🔗 [**Anti-Replay Single-Use Nonce Store (`evp.ts#L168-L170`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/evp.ts#L168-L170) · [Local Link](file:///d:/bda%20project/packages/core/src/control/evp.ts#L168-L170)
  * **What it does:** `if (this.seenNonces.has(req.nonce)) return this.reject(req.id, 'NONCE_REPLAY')` ensures replayed radio packets are immediately dropped.
* 🔗 [**Storm Guard Flooding Defense (`evp.ts#L147-L160`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/evp.ts#L147-L160) · [Local Link](file:///d:/bda%20project/packages/core/src/control/evp.ts#L147-L160)
  * **What it does:** Tracks 10-second request velocity (`requestHistory10s`). If an attacker floods >20 requests in 10s, it triggers an automated 30-second lockout.
* 🔗 [**Timestamp Skew Window Check (`hmac.ts#L38-L40`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/helpers/hmac.ts#L38-L40) · [Local Link](file:///d:/bda%20project/packages/core/src/helpers/hmac.ts#L38-L40)
  * **What it does:** Rejects any packet whose timestamp deviates by more than 30 seconds (`Math.abs(nowMs - tsMs) <= 30_000`).

### 2.3 Single-Writer Deterministic Safety Kernel
* 🔗 [**Single-Writer Signal Kernel (`kernel.ts#L120-L240`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L120-L240) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L120-L240)
  * **What it does:** The **sole writer** of `SignalState` in the entire codebase. Neither AI models, adaptive controllers, nor emergency overrides can write signal states directly.
* 🔗 [**Minimum Green Invariant I1 (`kernel.ts#L174-L179`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L174-L179) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L174-L179)
  * Enforces minimum green $\ge 7.0\,\text{s}$ (`TIMING.G_MIN_S`) to prevent rapid driver-confusing signal flickering.
* 🔗 [**Mandatory Yellow Clearance Invariant (`kernel.ts#L211-L216`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L211-L216) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L211-L216)
  * Enforces exactly $3.5\,\text{s}$ of yellow clearance (`TIMING.YELLOW_S`).
* 🔗 [**Mandatory All-Red Clearance Invariant (`kernel.ts#L225-L233`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L225-L233) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L225-L233)
  * Enforces exactly $2.0\,\text{s}$ of all-red clearance (`TIMING.ALL_RED_S`) to clear the intersection box before any conflicting phase turns green.
* 🔗 [**Anti-Starvation Clamp Invariant (`kernel.ts#L154-L162`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L154-L162) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L154-L162)
  * Tracks red wait time per phase; if any phase waits $\ge 120\,\text{s}$ (`TIMING.MAX_RED_WAIT_S`), green is forcibly yielded to that starved approach.
* 🔗 [**Formal Conflict Checker Proof I1–I6 (`kernel.ts#L286-L318`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L286-L318) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L286-L318)
  * `assertInvariants(nextState)` checks on **every single output state** that no two conflicting approaches ever display non-red signals simultaneously.

### 2.4 Autonomous Hardware Watchdog & Fail-Safe Fallback
* 🔗 [**Hardware Watchdog Heartbeat Loop (`watchdog.ts#L30-L75`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/watchdog.ts#L30-L75) · [Local Link](file:///d:/bda%20project/packages/core/src/control/watchdog.ts#L30-L75)
  * Constantly checks controller software heartbeat; if an algorithm freezes or crashes, the watchdog immediately isolates the controller.
* 🔗 [**Fail-Safe FLASH_RED Trigger & Safe Recovery (`kernel.ts#L95-L118`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L95-L118) · [Local Link](file:///d:/bda%20project/packages/core/src/control/kernel.ts#L95-L118)
  * `failSafe()` switches all signals into `FLASH_RED`; `recover()` enforces that exiting `FLASH_RED` **must pass through an `ALL_RED` buffer**.

---

## 3. MongoDB Operational Store & Time-Series Data Lake

* 🔗 [**MongoDB Connection, Schema & Index Provisioning (`mongo.ts#L20-L95`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/db/mongo.ts#L20-L95) · [Local Link](file:///d:/bda%20project/packages/edge/src/db/mongo.ts#L20-L95)
  * Auto-provisions 4 production collections: `incident_logs`, `audit_events`, `replays`, and `runs`. Creates compound indexes (`ts: -1`, `seed: 1`, `ttl: 1`).
* 🔗 [**Audit Event & Incident Telemetry Ingestion (`mongo.ts#L110-L160`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/db/mongo.ts#L110-L160) · [Local Link](file:///d:/bda%20project/packages/edge/src/db/mongo.ts#L110-L160)
  * Persists HMAC-verified EVP preemption runs, incident triggers, and operator interventions with bit-exact provenance.
* 🔗 [**Replay Ingestion & Ephemeral Storage (`replay.ts#L30-L90`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/routes/replay.ts#L30-L90) · [Local Link](file:///d:/bda%20project/packages/edge/src/routes/replay.ts#L30-L90)
  * Ingests full compressed simulation replays for post-incident time-travel analysis.

---

## 4. Meta AI Explainer & Provenance Guard

* 🔗 [**Deterministic Template Fallback & Tool Loop Router (`copilot.ts#L130-L210`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/copilot/index.ts#L130-L210) · [Local Link](file:///d:/bda%20project/packages/edge/src/copilot/index.ts#L130-L210)
  * 3-round bounded tool-calling loop with circuit breaker and fallback ladder.
* 🔗 [**Cryptographic Provenance Gate (`verifySemanticNumbers`) (`copilot.ts#L90-L120`)**](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/copilot/index.ts#L90-L120) · [Local Link](file:///d:/bda%20project/packages/edge/src/copilot/index.ts#L90-L120)
  * Verifies every number quoted by the LLM against the real physics engine. Drops hallucinated metrics with zero tolerance.

---

## 5. Master Clickable Presentation Table

| Feature / Architecture Area | Direct Clickable File & Line Link | Key Mechanism / Invariant |
|---|---|---|
| **Local Web Worker Isolation** | [sim.worker.ts#L173-L195](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/web/src/worker/sim.worker.ts#L173-L195) | Zero-copy `postMessage([vehicles.buffer, heads.buffer])` |
| **Dual-Twin Synchronous Step** | [twin.ts#L157-L196](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/worker/twin.ts#L157-L196) | Concurrent lockstep evaluation of Fixed vs. Adaptive |
| **Multi-Lane In-Memory Partitions** | [engine.ts#L65-L95](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/sim/engine.ts#L65-L95) | Isolated PRNG streams & independent ring buffers |
| **Edge Stream Windowing** | [urbanflow_lite.ts#L50-L110](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/pipeline/lite/urbanflow_lite.ts#L50-L110) | Local 10s rolling window & online EWMA tracker |
| **Cloudflare Durable Object** | [Room.ts#L35-L90](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/do/Room.ts#L35-L90) | Distributed multi-operator state synchronization |
| **Constant-Time HMAC-SHA256** | [hmac.ts#L30-L36](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/helpers/hmac.ts#L30-L36) | `crypto.subtle.verify` side-channel defense |
| **Gateway Signature Verification** | [security/index.ts#L52-L71](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/security/index.ts#L52-L71) | Inbound HMAC verification with pre-shared keys |
| **Anti-Replay Nonce Store** | [evp.ts#L168-L170](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/evp.ts#L168-L170) | Single-use `seenNonces` replay drop |
| **Storm Guard Flooding Limiter** | [evp.ts#L147-L160](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/evp.ts#L147-L160) | 10s request velocity > 20 triggers 30s lockout |
| **Minimum Green Invariant (`I1`)** | [kernel.ts#L174-L179](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L174-L179) | Clamps green duration $\ge 7.0\,\text{s}$ |
| **Yellow Clearance Invariant** | [kernel.ts#L211-L216](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L211-L216) | Strictly enforces $3.5\,\text{s}$ yellow clearance |
| **All-Red Clearance Invariant** | [kernel.ts#L225-L233](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L225-L233) | Strictly enforces $2.0\,\text{s}$ all-red buffer |
| **Anti-Starvation Clamp** | [kernel.ts#L154-L162](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L154-L162) | Grants green if any phase waits $\ge 120\,\text{s}$ |
| **Formal Conflict Checker (`I1-I6`)** | [kernel.ts#L286-L318](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L286-L318) | `assertInvariants(nextState)` safety proof |
| **Hardware Watchdog Heartbeat** | [watchdog.ts#L30-L75](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/watchdog.ts#L30-L75) | Heartbeat timeout triggers fail-safe isolation |
| **Fail-Safe & Recovery Hook** | [kernel.ts#L95-L118](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/core/src/control/kernel.ts#L95-L118) | `FLASH_RED` + mandatory `ALL_RED` recovery |
| **MongoDB Operations Lake** | [mongo.ts#L20-L95](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/db/mongo.ts#L20-L95) | 4 auto-provisioned indexed collections |
| **Provenance Verification Gate** | [copilot.ts#L90-L120](https://github.com/rabadiyameet073/urbanflow-traffic-intelligence/blob/main/packages/edge/src/copilot/index.ts#L90-L120) | Hallucination drop via `verifySemanticNumbers` |

