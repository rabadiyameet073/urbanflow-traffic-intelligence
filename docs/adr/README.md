# Architecture Decision Records (ADRs)

Every architectural decision that shapes UrbanFlow is recorded when it is made, preserving the context, alternatives considered, active choices, and consequences.

## Index of ADRs

| ID | Title | Status | Date |
|---|---|---|---|
| [ADR-001](0001-pure-deterministic-core.md) | `packages/core` is pure, deterministic TypeScript | Accepted | 2026-10-31 |
| [ADR-002](0002-browser-worker-signals-edge-gateway.md) | Signals are decided in the browser/Worker thread; edge is a gateway | Accepted | 2026-10-31 |
| [ADR-003](0003-single-writer-safety-kernel.md) | One writer of SignalState — the Safety Kernel | Accepted | 2026-10-31 |
| [ADR-004](0004-coarse-four-phase-conflict-model.md) | Coarse four-phase conflict model | Accepted | 2026-10-31 |
| [ADR-005](0005-switching-cost-aware-adaptive-controller.md) | Adaptive controller is switching-cost-aware | Accepted | 2026-10-31 |
| [ADR-006](0006-framework-light-vanilla-typescript-ui.md) | Framework-light UI (vanilla TypeScript + reactive store) | Accepted | 2026-10-31 |
| [ADR-007](0007-canvas-2d-worker-transferable-arrays.md) | Canvas 2D in a Web-Worker-driven architecture; no WebAssembly | Accepted | 2026-10-31 |
| [ADR-008](0008-parquet-lake-default-storage.md) | Parquet lake is default storage; HDFS/MinIO optional | Accepted | 2026-10-31 |
| [ADR-009](0009-kafka-kraft-pyspark-with-lite-fallback.md) | Kafka (KRaft) + PySpark with Lite mode fallback | Accepted | 2026-10-31 |
| [ADR-010](0010-cloudflare-workers-durable-objects.md) | Cloudflare Workers + one SQLite-backed Durable Object class | Accepted | 2026-10-31 |
| [ADR-011](0011-llm-provider-fallback-chain.md) | LLM provider adapter with an ordered fallback chain | Accepted | 2026-10-31 |
| [ADR-012](0012-hmac-signed-evp-gateway.md) | HMAC-signed EVP requests at the gateway | Accepted | 2026-10-31 |
| [ADR-013](0013-json-zod-wire-contracts.md) | JSON + zod for wire contracts | Accepted | 2026-10-31 |
| [ADR-014](0014-seeded-prng-independent-streams.md) | Seeded PRNG with named, independent streams | Accepted | 2026-10-31 |
| [ADR-015](0015-struct-of-arrays-vehicle-storage.md) | Struct-of-arrays vehicle storage, no allocation in tick loop | Accepted | 2026-10-31 |
| [ADR-016](0016-tune-train-seeds-held-out-reporting.md) | Tune on train seeds; publish only held-out results | Accepted | 2026-10-31 |
| [ADR-017](0017-pnpm-workspaces-single-verify.md) | pnpm workspaces monorepo with single verification workflow | Accepted | 2026-10-31 |
| [ADR-018](0018-property-tests-fast-check-vitest.md) | Vitest + fast-check + Playwright + pytest | Accepted | 2026-10-31 |
| [ADR-019](0019-share-state-url-hash-input-log.md) | Share state in URL hash as deterministic input log | Accepted | 2026-10-31 |
| [ADR-020](0020-right-hand-traffic-geometry.md) | Right-hand-traffic geometry; mirroring only by explicit config | Accepted | 2026-10-31 |
