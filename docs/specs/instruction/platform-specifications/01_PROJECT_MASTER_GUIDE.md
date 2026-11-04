# Module 01: Project Master Guide & Quality Bar

> **Single source of truth for what UrbanFlow AI is, what it must never become, and the bar every change is held to.**
> Read this first. Every other module in this pack assumes you have.

---

## 1. Project Vision

**UrbanFlow AI** is a smart-city traffic intelligence platform, built for the **Meta Global AI Developer Hackathon** (Indie Developer Track), that demonstrates three things at production-engineering quality:

1. **Adaptive signal control that is honestly better where it should be** — a deterministic, explainable controller compared against a fixed-time baseline on *identical* arrival streams, reported with confidence intervals, including the scenarios where it only ties.
2. **Emergency Vehicle Preemption (EVP) done properly** — detection-distance sweep, queue-flush planning, mandatory yellow/all-red, abuse-resistant requests, fair recovery.
3. **Meta AI used in depth, never in the control loop** — Muse Spark (structured outputs, function calling, image input) diagnoses and proposes; a Safety Kernel and a digital-twin what-if verify; a human approves. SAM 3.1, Muse Image and Muse Code complete the loop.

It is a **simulation and decision-support system**. It is never connected to real signal hardware.

---

## 2. The Non-Negotiable Standards

| # | Standard | One-line meaning | Enforced by |
|---|---|---|---|
| 1 | **Safety Kernel supremacy** | Only the Safety Kernel writes `SignalState`. Nothing else — not the controller, not EVP, not AI, not the UI. | Rule 06 |
| 2 | **AI advises, never controls** | AI output is schema-validated, bounded, kernel-verified, twin-verified, human-approved. | Rule 08 |
| 3 | **Determinism** | `packages/core` is pure: same seed + same inputs ⇒ bit-identical results. | Rule 07 |
| 4 | **Honest numbers** | Every shown number is measured (`results.json`) or labelled *assumption*. No hand-typed claims. | Rule 00 |
| 5 | **Zero cost** | Free tiers and open source only; Meta Model API only via hackathon credits. | Rule 11 |
| 6 | **No secrets** | Not in code, git history, logs, bundles, prompts, screenshots, or video. | Rule 10 |
| 7 | **Contracts are frozen** | Names/types/constants live in `packages/core/src/contracts.ts`. | Rule 12 |
| 8 | **Accessible by default** | Keyboard operable, colour-blind safe, reduced-motion respected. | Rule 13 |
| 9 | **Performance is a gate** | 60 FPS @ 200 vehicles, headless ≥ 100× real time, JS ≤ 350 KB gz. | Rule 14 |
| 10 | **Demo cannot break** | Core mode needs only a browser. Every optional layer degrades visibly and safely. | Rules 08, 15; module 13 |

---

## 3. The Architecture Rule (never violate)

> **The deterministic controller + Safety Kernel decide signals. The pipeline observes and stores. AI only advises.**

```
Observation → Controller (Fixed | Adaptive | EVP) → ControlAction (a *request*)
           → Safety Kernel (clamps, sequences, monitors) → SignalState (the only truth)
```

- A `ControlAction` is a **request**, never a command.
- The pipeline (Kafka → Spark → Parquet) is **downstream of** the simulation; nothing in the control path waits for it.
- AI returns **proposals** (bounded parameter changes); they pass zod bounds → Kernel dry-run → digital-twin what-if → human Approve.

---

## 4. Run Modes (demo reliability contract)

| Mode | Needs | Who uses it | Must work without the others |
|---|---|---|---|
| **Core** (default) | A browser | Judges' live demo | ✅ Always. No login, no backend, no GPU. |
| **Edge** | Cloudflare Worker deployed | Live copilot, signed EVP, rooms, replay links | Core unaffected when edge is offline (panel says "Edge offline — core demo unaffected") |
| **Pipeline** | Docker (Kafka + Spark) or Lite mode | Big-data proof, video capture, recorded replay | Core and Edge unaffected; replay is badge-labelled `REPLAY` |

Data source badges everywhere numbers appear: `LIVE-SIM`, `REPLAY`, `PRECOMPUTED`. AI answers carry a source badge: `muse-spark`, `llama-fallback`, `template`.

---

## 4a. Scope

| In scope | Out of scope (say so in `docs/LIMITATIONS.md`) |
|---|---|
| One 4-way intersection, 8 approach lanes, 4 phases, 5 vehicle types | Real signal hardware, NTCIP *compliance* (only an NTCIP-1202-**inspired** mapping layer) |
| Fixed-time vs adaptive A/B on identical arrivals | Network-wide coordination (Corridor mode is P2 stretch) |
| EVP with sweep, flush planner, recovery, signed gateway | Pedestrian/cyclist phases (P2 stretch) |
| Kafka → Spark → Parquet pipeline + anomaly detection; Lite mode | Production multi-tenant deployment |
| Muse Spark copilot, SAM 3.1 Camera Mode (precomputed), Muse Image lab | Live GPU inference in the judged demo |

---

## 5. Technology Stack Summary

Full registry with versions, licences and cost in `languages-and-tooling/57_TECH_STACK_REGISTRY.md`.

| Layer | Choice |
|---|---|
| Monorepo | pnpm workspaces; Node 20+; TypeScript strict |
| Core engine | Pure TypeScript (`packages/core`), runs in Node and a Web Worker |
| Web | Vite + TypeScript, Canvas 2D, framework-light UI, uPlot charts |
| Edge | Cloudflare Workers + Durable Object (SQLite-backed), free plan |
| Pipeline | Apache Kafka (KRaft), PySpark Structured Streaming 3.5.x, Parquet lake (HDFS/MinIO optional profiles) |
| AI | Meta Model API (`muse-spark-1.3`, non-contributor IDs) → Llama via Workers AI → deterministic templates |
| Vision | SAM 3.1 + Muse Image offline (Colab/Modal), precomputed outputs committed |
| Testing | Vitest, fast-check, Playwright, axe-core, pytest |
| CI | GitHub Actions on a public repo |

---

## 6. The Engineering Quality Bar ("Principal-level" definition)

A change is acceptable only if a skeptical principal engineer reviewing it would find:

1. **Invariants stated and tested** — not "it works on my seed". Safety, determinism, conservation (arrivals = exited + in-system + denied) have *property tests*.
2. **Failure modes designed, not discovered** — every network call has a timeout, retry budget, circuit breaker and a degradation path that is visible in the UI.
3. **Boundaries explicit** — pure core vs IO shell; trust boundaries drawn (browser ↔ edge ↔ AI provider ↔ pipeline) with validation at each crossing.
4. **Numbers reproducible** — one command regenerates every published figure from seeds.
5. **Costs bounded** — AI calls, Worker requests, DO storage and CI minutes have budgets and caps.
6. **Operable** — structured logs without secrets, health endpoint, runbook for each failure in `docs/`.
7. **Documented decisions** — every non-obvious choice has an ADR (module 11) written *when* it was made.
8. **Reversible** — small commits, exact-path staging, adapter seams (one-file provider swaps).

---

## 7. Document Precedence

When sources disagree, the higher one wins. See `06_SOURCE_DOCUMENT_RECONCILIATION.md` for every known conflict and its resolution.

1. `docs/specs/instruction/` (this pack) — binding.
2. `docs/reference/URBANFLOW_WINNING_PLAYBOOK.md` — task plan and corrected design.
3. `docs/reference/META_GLOBAL_AI_DEVELOPER_HACKATHON_DETAILS.md` — authoritative for dates, rubric, rules.
4. `docs/reference/SMART_CITY_TRAFFIC_INTELLIGENCE_PLATFORM.md` — product vision (several claims superseded; see 06).
5. `docs/reference/smart_city_traffic_intelligence_blueprint.md`, `docs/reference/traffic_signal_bigdata_project.md` — background reading from earlier student-project framings (G1–G8 groups, R1–R10 rules, 1 s / 10 s ticks). **Not binding.**

---

## 8. Glossary

| Term | Meaning |
|---|---|
| **Approach lane** | One of 8 monitored lanes: `NB-TR, NB-L, SB-TR, SB-L, EB-TR, EB-L, WB-TR, WB-L` |
| **Phase** | A set of non-conflicting lanes that may be green together: `P1_NS_LEFT, P2_NS_THRU, P3_EW_LEFT, P4_EW_THRU` |
| **Safety Kernel** | The only writer of `SignalState`; enforces timing and conflict invariants |
| **Conflict Monitor** | Per-tick checker on the *output* signal state; throws in tests, counts in production |
| **EVP** | Emergency Vehicle Preemption |
| **TIGHT plan** | EVP plan where ETA < required lead time; shortfall is reported, yellow/all-red are never shortened |
| **Pressure** | Controller demand score per lane/phase |
| **Efficiency hold** | `G_MIN_EFFICIENT_S` — switching-cost guard, distinct from the safety minimum `G_MIN_S` |
| **Digital-twin what-if** | Clone simulator state, fast-forward twice (current vs proposed params) on identical arrivals |
| **Lite mode** | In-process Node implementation of the pipeline window/anomaly logic with identical output schemas |
| **Held-out seeds** | Seeds never used during tuning; the only source of published results |
| **Twin view** | Two synchronized intersections (Fixed vs Adaptive) fed the same arrival stream |

---

## 9. Honesty Statement (appears, in spirit, in README and LIMITATIONS)

UrbanFlow AI is a research simulation. It does not control real roads. Its results are simulation results on a documented model. Claims of compliance (NTCIP, hardware fail-safe timing) are not made; only inspired mappings and simulated watchdogs are claimed, with measured numbers.
