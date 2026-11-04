# Module 11: Architecture Decision Records (ADRs)

> Every decision that a future reader might want to reverse is recorded **when it is made**. Status: `Accepted` unless noted. New ADRs append here (or `docs/adr/NNN-title.md` once the repo exists; this module is the seed set).

---

## ADR Template

```markdown
# ADR-NNN: <decision in one line>
- Status: Proposed | Accepted | Superseded by ADR-MMM
- Date: YYYY-MM-DD
- Deciders: <developer>
## Context        (forces, constraints, what we know and don't)
## Options        (≥ 2 real alternatives, with honest pros/cons)
## Decision       (the choice, in active voice)
## Consequences   (good, bad, what we must now do, how we'd reverse it)
## Evidence       (benchmark, test, doc link)
```

Rules: one decision per ADR · alternatives must be real · consequences must include the negatives · link the ADR from the code comment or module that depends on it.

---

## ADR-001: `packages/core` is pure, deterministic TypeScript
- **Context:** Fair A/B comparison, shareable replay links, property tests and time-travel all require bit-identical runs in Node and browsers.
- **Options:** (a) pure TS with injected seeded RNG and no clocks; (b) allow `Date.now`/`Math.random` behind wrappers; (c) Rust→WASM.
- **Decision:** (a). No `Math.random`, `Date.now`, DOM, network or timers in `core`; time is the tick counter.
- **Consequences:** + reproducibility, testability, runs on Workers; − must pass seeds/time explicitly; WASM speed-up forgone (not needed: ≥ 100× real time is achievable with typed arrays).

## ADR-002: Signals are decided in the browser/Worker thread; the edge is a gateway
- **Context:** Judges open a URL; the platform doc routes decisions through Kafka → Spark → edge, which adds seconds of latency and fragile dependencies.
- **Decision:** Controller + Kernel run in `core` in a Web Worker. Edge provides rooms, signed EVP gateway, copilot and replay storage only.
- **Consequences:** + demo works offline; + control loop has zero network dependency; − "distributed control" claims are not made.

## ADR-003: One writer of `SignalState` — the Safety Kernel
- **Decision:** Controllers and EVP emit *requests*; only `SafetyKernel.step()` mutates state; ConflictMonitor validates output every tick.
- **Consequences:** Safety proof is localised (small state space → exhaustive BFS feasible); every other module is simpler because it cannot violate safety.

## ADR-004: Coarse four-phase conflict model
- **Decision:** Any two different phases conflict. No overlap phases, no permissive lefts.
- **Consequences:** + exhaustive verification; − lower theoretical capacity than NEMA dual-ring; documented in LIMITATIONS; revisit only with a reference-model update.

## ADR-005: Adaptive controller is switching-cost-aware
- **Context:** Sanity model: a Gmin = 7 s pressure controller was 2–3× worse than fixed-time at balanced demand.
- **Decision:** Add `G_MIN_EFFICIENT_S` hold, `RATIO·cur + FLOOR` margin, gap-out and forced max-green. Tune on train seeds only.
- **Consequences:** Parity-or-better across scenarios; more parameters to tune → mandatory held-out reporting (ADR-016).

## ADR-006: Framework-light UI (vanilla TypeScript + tiny reactive store)
- **Context:** Playbook mandates "no heavy UI framework"; bundle budget 350 KB gz; AI-generated code must stay reviewable.
- **Options:** React 19; Preact; Lit; vanilla TS modules.
- **Decision:** Vanilla TS components (factory functions returning an element + dispose) over a ~100-line signals store. Preact (3 KB) is the **pre-approved escape hatch** if component count makes vanilla unmaintainable — requires a new ADR.
- **Consequences:** + tiny bundle, no VDOM cost beside a 60 FPS canvas; − fewer ready-made accessible widgets → we own a11y (module 32).

## ADR-007: Canvas 2D in a Web-Worker-driven architecture; no WebAssembly
- **Decision:** Simulation in a Worker, transferable typed arrays per frame, Canvas 2D on the main thread with interpolation between ticks. `OffscreenCanvas` rendering is an optimisation, not a requirement.
- **Consequences:** + 60 FPS with 200 vehicles is realistic; − no GPU instancing (not needed at this scale).

## ADR-008: Parquet lake is the default storage; HDFS/MinIO are optional profiles
- **Context:** HDFS costs RAM and setup time and adds no judged value; claims must match what ran.
- **Decision:** Parquet on a Docker volume by default; `s3` (MinIO) and `hdfs` compose profiles optional.
- **Consequences:** + runs in ≈ 4 GB; − "Hadoop" is not in the default story; docs say honestly which is default.

## ADR-009: Kafka (KRaft, single broker) + PySpark local mode; Lite mode for small machines
- **Decision:** `apache/kafka` KRaft, 3-partition keyed topics; Spark 3.5.x local mode, connector package pinned to the same Spark/Scala version; `pnpm pipeline:lite` implements identical windows/anomalies in Node with identical output schemas.
- **Consequences:** + real pipeline proof and an honest fallback; − parity test required between Lite and Spark outputs.

## ADR-010: Cloudflare Workers + one SQLite-backed Durable Object class
- **Decision:** Free-plan compatible; DO holds rooms (WebSocket Hibernation API), nonces, rate counters, replay blobs, AI counters.
- **Consequences:** + zero cost, global edge, strong per-room consistency; − single DO class = single point of throughput per room (rooms are small: ≤ 50 viewers).

## ADR-011: LLM provider adapter with an ordered fallback chain
- **Decision:** `LlmProvider` interface; `MetaProvider → WorkersAIProvider → TemplateProvider` (+ Ollama dev-only). All provider-specific request shaping lives in `providers/meta.ts`.
- **Consequences:** A docs mismatch is a one-file fix; the demo never depends on one vendor's uptime; source badge preserves honesty.

## ADR-012: HMAC-signed EVP requests at the gateway
- **Decision:** HMAC-SHA256 over canonical JSON; ±30 s timestamp window; nonce replay store (5 min); rate limits; plausibility checks; storm guard; constant-time verification via Web Crypto.
- **Consequences:** Forgery/replay/storm are demonstrable and tested; secret management obligation (Rule 10). The public demo uses short-lived demo tokens that never expose the secret.

## ADR-013: JSON + zod for wire contracts (no Avro/Protobuf for now)
- **Decision:** JSON over Kafka/WS with versioned zod schemas mirrored as Spark `StructType`s; parity-tested.
- **Consequences:** + debuggable; − larger payloads (irrelevant at ≈ 100 msg/s). Avro/Schema Registry is listed as a production path in LIMITATIONS.

## ADR-014: Seeded PRNG with named, independent streams
- **Decision:** `mulberry32` + `splitRng(seed, label)`; per-lane arrival and type streams independent of everything else.
- **Consequences:** Arrivals identical across controllers and across full-lane conditions; adding a new random consumer never perturbs existing ones.

## ADR-015: Struct-of-arrays vehicle storage, no allocation in the tick loop
- **Decision:** Typed arrays per lane; free-list reuse; no `Map`/object churn in the hot path.
- **Consequences:** ≥ 100× real time is attainable; code is less idiomatic → isolated in `sim/` with benchmark guard.

## ADR-016: Tune on train seeds; publish only held-out results
- **Decision:** `bench tune` uses seeds 1–100; `bench run` reports seeds 1001+; train–held-out gap reported (target ≈ within 5 points).
- **Consequences:** Defensible numbers; slower tuning loop.

## ADR-017: pnpm workspaces monorepo with a single `pnpm verify`
- **Decision:** `lint + typecheck + test + build` in one command; CI runs the same command.
- **Consequences:** "Green locally = green in CI"; contributors (human or Muse) have one definition of done.

## ADR-018: Vitest + fast-check + Playwright + axe-core + pytest
- **Decision:** Property tests for invariants, Playwright for e2e/visual/perf/a11y, pytest for pipeline/vision.
- **Consequences:** Cohesive free toolchain; visual baselines need a pinned browser version in CI.

## ADR-019: Share state in the URL hash as a deterministic input log
- **Decision:** `{scenarioId, seed, overrides, detectionDistance, inputLog}` → deflate (CompressionStream) → base64url; footer shows a state hash that must match across browsers.
- **Consequences:** Judges can reproduce runs; codec is fuzzed (malformed hash never throws).

## ADR-020: Right-hand-traffic geometry; mirroring only by explicit config
- **Decision:** US-style protected lefts; the left-hand-traffic variant in a source doc is out of scope.
- **Consequences:** Lane names stay stable; a mirrored config would need its own ADR and tests.
