# Changelog

All notable changes to this project. Versions are not published packages; the
entries track the work that changed behaviour or changed a published number.

## [Unreleased] — submission-v1

### Added — architectural fitness functions as a gate (Module 10 §8)

- **`pnpm fitness`** (`scripts/fitness.mjs`) checks seven properties with no new
  dependency: `core` purity (no clock, no `Math.random`, no DOM/Node globals), the
  package dependency law, circular imports, the single writer of `SignalState`,
  the 350 KiB gz bundle budget, secret values in the built bundle, and the
  hardening headers on the static origin. It runs inside `pnpm verify`, so the
  properties Module 10 §8 lists are checked rather than described.
- It found a real cycle on the first run: `control/what_if.ts` and
  `vision/camera_mode.ts` imported through the barrel (`../index.js`), making both
  of them part of an import loop. Both now import from the defining modules.

### Fixed — four more real-clock and real-randomness reads in `core`

- **`ChaosEngine.injectPerceptionNoise` used `Math.random()`**, so the
  perception-noise robustness curve could not be reproduced from any seed and no
  number derived from it could honestly be quoted (Rule 00). It now takes an
  injected stream (`splitRng(seed, 'chaos-noise')`), and a test asserts that two
  runs from one seed agree while the noise still perturbs.
- **`ControlLoopWatchdog` measured fail-safe latency with `performance.now()`** —
  that is JS scheduling jitter, not control-loop latency, and it changed on every
  run. The recorded value is now simulated time: `0` means the trip happened on
  the tick that observed the fault, which is the property the safety case claims.
- **`toNtcip1202Status` stamped `new Date()`**, so a status report described the
  moment it was generated rather than the state it reported. It takes `simTimeS`.
- **`createDebugBundle` read `new Date()` and `navigator`** inside `core`, and
  defaulted `appVersion` to a hard-coded `'v1.0.0'` — a fabricated identifier in a
  bug report. `exportedAt`, `userAgent` and `appVersion` are now required and
  supplied by the IO shell that owns the export.
- The three remaining clock derivations now share one helper,
  `helpers/sim-clock.ts`, so the EVP record, the NTCIP status and the debug bundle
  cannot drift apart.

### Changed — kernel gauges survive the worker boundary (Module 16 §4.1)

- `SafetyKernel.getMetrics()` already tracked `minGreenSeenS`,
  `maxGreenSeenS`, `yellowCompliancePct`, `allRedCompliancePct` and a per-kind
  `violationsPrevented` breakdown. The `safety` event collapsed all of it into a
  single integer, so none of it could be displayed. The event now carries the
  gauges verbatim and the Audit panel renders them.

### Added — EVP decision counters survive the plan (Module 16 §4.1)

- `evp.requests{accepted,rejected,reason}` and `evp.shortfallS` did not exist.
  `EvpManager.getStatus()` is `null` once a preemption ends, so a refusal was
  visible only for as long as the plan that refused it existed; the outcome of a
  whole run could not be read afterwards. `getCounters()` now returns accepted and
  rejected totals, a per-reason map and every plan's shortfall. Counting happens
  once per decision — an idempotent replay returns the cached response before the
  counters are touched, so repeating a request cannot inflate them — and `reset()`
  clears them with the rest of the run.
- The counters cross the worker boundary in the `evp` event and the Audit panel
  renders three rows: decisions, refusals by reason, worst shortfall.
- `core.test.ts` asserts the three decisions, the two reasons, the 9.5 s
  shortfall, the replay-not-counted rule and the reset.

### Changed — one canonical boot state

- `INITIAL_SIGNAL_STATE` lives in `contracts.ts` beside the `SignalState` type,
  and `SimEngine` copies it instead of rebuilding the literal. Module 13 §2 E1
  asks that only the kernel write `SignalState`; the pre-first-tick state was a
  second construction site.

### Fixed — determinism of the EVP audit record

- **`EvpManager.reject` read the real clock.** Every accepted request was stamped
  from a fixed simulated epoch, but every *rejected* one was stamped with
  `new Date().toISOString()` — a wall-clock read inside `packages/core`, which
  Rule 07 forbids. Two runs of one seed therefore produced different audit
  records, and the two branches of the same field disagreed about what clock
  they were on. Both now go through one `serverTimeAt(simTimeS)` helper; the
  test suite asserts that the timestamp advances by exactly the simulated
  seconds and by nothing else.
- **One preemption, stated instead of accidental.** A request arriving while
  another was running used to overwrite `activeEms`, silently discarding the
  vehicle the operator was watching. A same-phase request is now served by the
  running plan; a conflicting one is refused with the new reason
  `PREEMPTION_ACTIVE`. Module 03 §5.3.
- **`EvpManager.cancelRequest(id)`** and the matching `cancelPreemption` command
  through the worker, so a preemption can be abandoned: `PRECLEAR` drops
  straight back to normal control, a granted green hands over to the 60 s
  recovery window.

### Fixed — the decision ledger now names preemption

- The explainability panel showed whatever the adaptive controller had just
  decided, even while an ambulance was holding the green — because `EVP` is not
  a rule the controller can return, it is a directive the kernel applies. The
  twin world now records `EVP` as the rule in force for those ticks (Module 03
  §4 lists it) and the panel has copy for it. Before this, the panel explained a
  decision that was not the one in force.

### Added — verify-before-apply is reachable from the UI

- **"Try an unsafe proposal"** button in the copilot panel. It sends a proposal
  that names `YELLOW_S` to the digital-twin what-if and renders the refusal
  verbatim, which is Module 04 §3.4's deliberate rejection path. The text says
  "UNEXPECTED" if the verdict ever comes back approved, because that would mean
  the safety boundary regressed.
- `verifyProposal` command and `proposalVerified` event on the worker protocol.
  The what-if runs in the worker, next to the simulation, and applies nothing.

### Fixed — the what-if said more than it did

- `evaluateProposalWhatIf` documented itself as cloning the simulation state and
  fast-forwarding from it. It never did: both arms start at `t = 0`. The
  docstring now states what it is (a fair A/B on the scenario's own seed), the
  dead `simTimeS` read is gone, the magic `seed + 100` offset is gone so the two
  arms share the arrival stream that is actually on screen, and a zod-bounds
  failure no longer reports `kernelViolations: 1` when nothing reached the
  kernel.

### Added — contracts freeze test

- Module 02 §2 asks for a contracts snapshot test. The suite now pins the
  lane→phase table, the phase→lane table, the vehicle class table against
  Module 02 §1.2, the adaptive defaults *and* every documented bound (both sides
  of each range), the untunability of the five safety timings, the CO₂ factors
  and the HCM thresholds. It replaces a test that asserted
  `typeof res.approved === 'boolean'` — an assertion that could not fail.

### Fixed — benchmark integrity (highest impact)

- **Inverted IDM leader gap in `core/sim/engine.ts`.** The follower-to-leader gap
  was computed as `leaderPos - pos - leaderLen` instead of
  `pos - leaderPos - leaderLen`. Because position grows upstream, this produced a
  permanently negative gap: every second vehicle in a lane was pinned at
  `pos ≈ 293 m` with zero velocity, blocking the approach. Effect: 55–87 % of
  arrivals were denied and throughput was reported at roughly 438 veh/h.
  After the fix, the same seed produced 173 exits instead of 73, 39 denials
  instead of 265, and 1 038 veh/h instead of 438. Every published number was
  regenerated afterwards.
- **Fabricated metrics removed from `bench/runner.ts`.** `avgDelayS` was
  `mean * 0.9`, `throughputVph` was hard-coded to `{1850, 1980}`, and
  `kernelConflicts` was hard-coded to `0`. All three are now measured:
  `avgDelayS` is accrued delay divided by exits, `throughputVph` is
  `exits / simSeconds * 3600`, and `kernelConflicts` sums
  `SafetyKernel.getMetrics().conflicts` for both controllers.
- **EVP sweep results were artefacts.** `ems-sweep.ts` initialised the measured
  delay to `18.0` and `dist === 150 ? 9.5 : 2.5`, and derived `tightPlansPct`
  from `eta < requiredLead` arithmetic rather than from the EVP manager. All
  three distances consequently reported identical means with zero-width
  intervals. The sweep now spawns the emergency vehicle at its physical
  detection distance, reads `planStatus`/`shortfallS` from the emitted
  `EvpDirective`, counts unobserved seeds explicitly, and reports a paired
  bootstrap CI on the per-seed difference.
- **`docs/RESULTS.md` rewritten.** The previous version claimed
  "Fixed 79.48 s vs Adaptive 117.25 s, −55.9 %, Adaptive Wins" — self-contradictory
  and unsupported by `results.json`. The document is now generated from the
  artefacts and reports parity and losses alongside the wins.

### Added — simulation

- `SimEngine.spawnEmsAt(lane, distanceM)` and `SimLane.insertOrdered(...)` so an
  emergency vehicle can start at a physical position inside an approach rather
  than at its boundary, with the queue order kept consistent.
- `SimEngine.applyParams(patch)` renormalises a partial modal split and re-arms
  only the lanes that were actually edited, drawing from each lane's existing
  seeded stream so the patch is replayable.

### Added — worker boundary

`README.md` claimed "Canvas 2D rendered in a Web Worker with transferable
buffers" and ADR 0007 was written to match, but there was no worker: the physics
ran in `requestAnimationFrame` on the main thread. The claim is now implemented
rather than removed.

- `core/sim/geometry.ts`: the single world↔canvas mapping. Metres in, pixels out,
  with right-hand lane anchors, `laneAtWorldPoint` hit testing and
  `pointInPolygon`. The renderer no longer keeps its own copy of the anchor
  arithmetic, which is how a glyph drifts off its lane.
- `core/worker/protocol.ts`: versioned message catalogue, zod-validated on
  arrival. Frame buffers are one `Float32Array` of stride 6
  `[x, y, headingRad, lengthM, typeIdx, flags]` plus a `Uint8Array` of signal
  heads and a JSON header. A message from a different protocol version is
  refused instead of guessed at.
- `core/worker/twin.ts`: `TwinWorld` owns both engines, both kernels, both
  controllers and both accumulators, and steps them in one fixed order
  (observe → decide → request → kernel writes → physics → metrics). It is pure,
  so the whole thing is testable in Node.
- Time travel is replay, not snapshots: rebuilding from `(seed, input log, tick
  count)` reproduces a state hash exactly without serialising eight typed arrays
  per twin and the closure state of sixteen RNG streams.
- `web/worker/sim.worker.ts` is the IO shell — the only place a wall clock is
  read, and only to decide *how many* `SIM_DT_S` ticks to run, capped per frame.
  `web/worker/client.ts` owns the four-buffer pool, the heartbeat and restart.
- `AppStore` is now a view model with no engine inside it, which removes the
  possibility of the UI re-deriving a metric the worker measured.

### Fixed — honesty in the UI

- `updateLaneTable` computed queue length from `lane.pos[]` on the main thread.
  It now renders `LaneObservation.queueLengthM` from the same observer the kernel
  uses, so the number on screen and the number the controller reacted to cannot
  disagree.
- The judge tour incremented `violationsPrevented` by one "to exercise kernel
  rejection". That was a fabricated counter; the panel now shows the kernel's own
  count, which is zero when nothing was prevented.
- `runDiagnosis` called `observe()` on a store-owned engine to build an input
  window. With the engine in a worker it refuses instead, and says no measured
  window has arrived yet rather than inventing one.
- `SimEngine` copied its config shallowly, so both twins shared one
  `laneDemandVph` and one `modalSplit` record: editing one silently edited the
  other, and the caller's object too. Each engine now owns its nested records.
- `TwinWorld` rebuilt time-travel replays from the *mutated* config, baking edits
  into the initial state and re-applying them from the log — one extra RNG draw
  per re-armed lane. Rebuilds now start from the launch config.

### Added — edge gateway

- Route table with 11 routes and a uniform error envelope covering
  `400/401/403/404/405/409/410/413/415/422/429/500/503`.
- `405 METHOD_NOT_ALLOWED` distinct from `404 NOT_FOUND` via `router.matchPath`.
- CORS with an explicit allow-list, `Vary: Origin`, and `403 ORIGIN_FORBIDDEN`
  without an `Access-Control-Allow-Origin` header. A literal `*` in
  `ALLOWED_ORIGINS` is ignored.
- `X-Robots-Tag: noindex`, a strict CSP, and cache policy where only
  `/api/health` is cacheable (`max-age=5`).
- Atomic nonce insertion (`INSERT OR IGNORE` + `rowsWritten`) replacing a
  check-then-insert that could race two concurrent replays into both succeeding.
- Durable Object alarm-driven TTL cleanup for nonces, replay log, rate-limit
  windows and the AI usage ledger; `fetch("/rpc")` dispatch so `env.ROOM` stubs
  are callable; WebSocket transport with 16 KB / 20 msg/s / 3-strike limits.
- Budget guard with per-IP, per-source and global caps; AI limits degrade
  silently to the template provider instead of failing the request.
- Copilot wire envelopes (`{source, latencyMs, tokens, costUsdEstimate,
  diagnosis}` and friends), a 60 s response cache, and a 3-failure circuit
  breaker. Cost is accumulated in integer micro-USD.
- Numeric provenance check on diagnoses: a number that does not appear in the
  input window fails validation and falls back to the template provider.
- Deterministic `chat()` fallback that refuses requests to force or override a
  signal, and never echoes the raw question.

### Added — tooling and documentation

- `pnpm docs:check` (`scripts/docs-check.mjs`) diffs `README.md` and
  `docs/RESULTS.md` against the benchmark artefacts and fails on drift, banned
  claims, or unfilled placeholders. Wired into `pnpm verify`.
- `README.md`, `docs/ARCHITECTURE.md`, `docs/DEMO_SCRIPT.md`, `SECURITY.md`,
  `CONTRIBUTING.md`, `LICENSE` (MIT), `.env.example`.
- `packages/bench/out/` is now committed rather than ignored, because every
  published number is derived from it.

### Changed

- EVP request handling order is `HMAC → nonce → rate limit → plausibility`.
  Module 21 orders rate limiting before signature verification, but Module 22
  promises that a retried nonce returns the same decision, and a `429` would
  break that promise. The deviation is documented in the handler.
- `docs/LIMITATIONS.md` gained a measurement-limitations section recording the
  survivorship bias in `personDelayS`, the five-seed resolution limit, and the
  negative preemption result.

### Known and reported, not fixed

- **Preemption does not reduce measured ambulance delay.** All three paired
  intervals in the detection sweep include zero. The binding constraint in this
  model is the physical queue ahead of the emergency vehicle, not the signal.
  This is reported as a negative result rather than tuned away.
- **`Stadium Surge Dump` misses its stated expectation**: point estimate
  −12.3 %, interval spanning zero. Retained unchanged.
- **Four of eight scenarios are statistically unresolved** with five held-out
  seeds. The supported claim is "never significantly worse, significantly
  better in 4 of 8".
