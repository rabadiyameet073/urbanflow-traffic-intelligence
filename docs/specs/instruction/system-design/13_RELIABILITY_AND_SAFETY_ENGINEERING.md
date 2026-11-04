# Module 13: Reliability & Safety Engineering

> How we make "a signal controller simulation that judges will try to break" actually hold. Contains the hazard analysis, the safety-case structure, the verification ladder, degradation design, and chaos matrix.

---

## 1. Hazard Analysis (HARA-lite)

| ID | Hazard (in the simulated system) | Cause examples | Severity | Control (preventive) | Detection | Verification |
|---|---|---|---|---|---|---|
| H1 | Conflicting greens | Controller bug, EVP bug, race, AI proposal | Catastrophic | Kernel single-writer; coarse conflict model | ConflictMonitor each tick | Property tests, BFS, differential, mutation |
| H2 | Yellow/all-red shortened | EVP truncation, param tampering | Catastrophic | No setter; Kernel owns timers | `assertInvariants` I2/I5 | Property tests; 15 mutants |
| H3 | Starvation of a phase | Dominant demand; repeated EVP | Major | `MAX_RED_WAIT_S` forced-next; recovery fairness | Kernel counter | Starvation property tests |
| H4 | Signal flicker from invalid input | EVP storm, forged requests | Major | Validation before Kernel; storm guard | Flicker counter = 0 | 1000-request storm test |
| H5 | Silent controller death | Exception in controller/worker | Major | Watchdog heartbeat | Missed deadline | Chaos tests |
| H6 | AI-induced unsafe config | Hallucinated or injected proposal | Major | zod bounds + kernel dry-run + twin + human | Rejection reasons | Injection, poisoned-fixture tests |
| H7 | False performance claims | Hard-coded or cherry-picked numbers | Reputational | Rule 00; `results.json`; held-out seeds | `docs:check` | CI gate |
| H8 | Benchmark unfairness | Different arrivals; denied entries hidden | Reputational | Per-lane seeded streams; denied counter | Fair-arrivals test | Identical-log test |
| H9 | Demo unavailability | Edge/AI/pipeline outage | Demo-critical | Core mode; fallbacks; offline bundle | Smoke tests | Chaos + offline e2e |
| H10 | Secret exposure | Logs, bundle, screenshots | Major | Rule 10 | gitleaks, bundle grep | CI + manual review |

---

## 2. Safety Case Structure (`docs/SAFETY_CASE.md`)

Goal-structured argument (GSN-lite). Each claim has an argument and links to *executable* evidence.

```
G0  The simulated controller never presents conflicting greens and never shortens clearance intervals.
 ├─ S1 Argument by architecture: single writer (ADR-003) + coarse conflict model (ADR-004)
 │    └─ E1 static check: no code outside kernel/ assigns SignalState (grep gate + ESLint rule)
 ├─ S2 Argument by exhaustive verification: reachable-state BFS over (phase, indication, t@0.5 s, pending request)
 │    └─ E2 test output: "explored N states, 0 violations"
 ├─ S3 Argument by randomised verification: ≥ 200 fast-check runs × 20 k ticks incl. malicious requests
 │    └─ E3 test output
 ├─ S4 Argument by independent implementation: differential test vs reference model (Muse Code, 2 M ticks)
 │    └─ E4 "0 differences"
 ├─ S5 Argument by mutation: 15 seeded kernel mutants all caught
 │    └─ E5 "15/15 killed"
 └─ S6 Argument by runtime monitoring: ConflictMonitor + watchdog → FLASH_RED
      └─ E6 chaos test: measured reversion time
Assumptions & limits (A1–An): coarse conflict model; no pedestrians; simulation only.
```

Honest ending: *"This is a simulation safety argument, not a certification."*

---

## 3. Verification Ladder (cheapest first)

| Rung | Technique | Finds | Runs in |
|---|---|---|---|
| 1 | Types + zod at boundaries | Shape errors | every `verify` |
| 2 | Example unit tests | Known cases | every `verify` |
| 3 | Property tests (fast-check) | Edge cases, malicious sequences | every `verify` |
| 4 | Exhaustive BFS of the kernel state space | *Any* reachable violation in the discretised model | every `verify` (seconds) |
| 5 | Differential vs independent reference model | Shared misconceptions | CI nightly / pre-release |
| 6 | Mutation testing (15 hand-made mutants) | Weak tests | pre-release |
| 7 | Chaos/fault injection | Degradation bugs | pre-release + e2e |
| 8 | Soak (10 sim-hours + 30 min browser) | Leaks, drift | pre-release |

Never weaken a test to pass (Rule 17). A failing safety test is a P0 stop.

---

## 4. Failure Mode & Effects (FMEA-lite) for Optional Layers

| Component | Failure | Effect | Mitigation | Residual |
|---|---|---|---|---|
| Edge | Down / slow | No copilot, no rooms | Timeout 6 s; PRECOMPUTED panel | None for core |
| Meta API | 5xx, rate limit, invalid JSON | No Muse answers | Retry once → Llama → Template; breaker | Lower-quality text, still valid schema |
| DO | Storage error | Rooms/replay lost | Uniform error; client retry once | Feature degraded |
| Kafka | Broker down | No pipeline data | Producer buffer; UI falls back to replay | Pipeline view = REPLAY |
| Spark | Crash | Stale metrics | Restart from checkpoint | Parquet intact |
| Browser worker | Crash/OOM | Sim stops | Restart from keyframe (every 60 sim-s) | ≤ 60 s state rewind |
| URL hash | Corrupt | Default scenario | Codec ignores | None |

---

## 5. Degradation Ladder (always visible, never silent)

```
Full:       Core + Edge(Muse Spark) + Pipeline(Spark)
Level 1:    Core + Edge(Llama/Template)         badge: llama-fallback | template
Level 2:    Core + cached PRECOMPUTED copilot   badge: PRECOMPUTED
Level 3:    Core only                            toast: "Edge offline — core demo unaffected"
Level 4:    Kernel fault → FLASH_RED → recover() → baseline fixed-time
```

Every level has an e2e test (module 60).

---

## 6. Resilience Patterns (use them, name them in code)

| Pattern | Where | Parameters |
|---|---|---|
| **Timeout** | Every network call | 6 s providers; 3 s edge health; 10 s replay store |
| **Retry with budget** | 5xx only, idempotent calls | 1 retry, jittered 200–400 ms |
| **Circuit breaker** | Provider router | Open 60 s after 3 consecutive failures; half-open single probe |
| **Bulkhead** | AI vs EVP gateway vs replay | Separate rate-limit buckets and counters |
| **Rate limit** | Edge routes | Per IP, per source, per session, global daily |
| **Idempotency** | `/api/evp`, replay store | Request `id` returns the same decision |
| **Watchdog** | Control loop | Heartbeat each tick; miss ⇒ `failSafe()` |
| **Graceful shutdown** | Spark/producer | `stopGracefullyOnShutdown`; flush producer |
| **Backpressure** | Pipeline | `maxOffsetsPerTrigger`; producer drops are *counted*, not silent |
| **Keyframes** | Sim | Snapshot every 60 sim-s; restore determinism tested |

---

## 7. Chaos Matrix (Task 15 — `pnpm test chaos` + e2e)

| Injection | Expected | Measured |
|---|---|---|
| Kill AI provider (500s) | Template within one request; badge flips | time-to-fallback |
| Block Edge entirely | Core continues; offline message | none |
| Kernel throws / heartbeat stops | `FLASH_RED` ≤ 1 tick | simulated reversion ms |
| `recover()` | ALL_RED 2.0 s → baseline fixed | sequence timing |
| Pipeline stopped | REPLAY badge | none |
| Corrupted share link | Ignored safely | fuzz 1000 strings: 0 throws |
| Worker crash | Restart from keyframe, toast | rewind ≤ 60 sim-s |
| Perception noise (counts ±x %, dropouts) | Degradation curve; no safety violation | delay vs noise |

Claim only measured numbers; never claim a hardware 200 ms property.

---

## 8. SLOs for the Demo (internal, measurable)

| SLI | Target | How measured |
|---|---|---|
| Page interactive (Core) on mid laptop | ≤ 3 s | Playwright + Lighthouse |
| Frame time p95 @ 200 vehicles | ≤ 20 ms local (CI ≤ 33 ms) | rAF sampling |
| Live smoke success | 100 % of last 10 runs | `pnpm smoke` |
| Copilot answer p95 (Meta) | ≤ 6 s else fallback | edge logs |
| Safety violations | 0 | ConflictMonitor counter |
| Uptime of live URL during judging | ≥ 99 % | external ping at 5-min interval + daily smoke |

Error budget logic: any SLO miss in the last 48 h before submission blocks new features (Rule 15).

---

## 9. Runbooks (write each as a short `docs/runbooks/*.md` before submission)

1. Live URL returns an error → rollback procedure, offline bundle link.
2. AI cost spike → lower `AI_DAILY_CAP`, rotate key.
3. Secret leaked → rotate (`wrangler secret put`), purge from history, invalidate demo tokens.
4. Worker/DO error rate rising → check limits dashboard, disable rooms, keep health.
5. Pipeline won't start → memory, ports, Lite mode.
6. Safety test fails → stop, do not patch the test, bisect to commit, fix kernel, add regression test.
